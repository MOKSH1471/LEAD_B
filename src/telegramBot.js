const { Telegraf } = require('telegraf');
const { config, validateConfig } = require('./config');
const { runCampaign } = require('./pipeline');
const { startReplyTracker, getAllReplies } = require('./replyTracker');
const fs = require('fs');
const path = require('path');

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error('\n❌ [Telegram Bot Error] TELEGRAM_BOT_TOKEN is not set in .env!');
  process.exit(1);
}

validateConfig();

const SUBSCRIBERS_FILE = path.resolve(process.cwd(), 'subscribers.json');
let subscribers = new Set();

function loadSubscribers() {
  try {
    if (fs.existsSync(SUBSCRIBERS_FILE)) {
      const list = JSON.parse(fs.readFileSync(SUBSCRIBERS_FILE, 'utf-8'));
      subscribers = new Set(list);
    }
  } catch (e) {}
}

function saveSubscribers() {
  try {
    fs.writeFileSync(SUBSCRIBERS_FILE, JSON.stringify(Array.from(subscribers), null, 2), 'utf-8');
  } catch (e) {}
}

loadSubscribers();

function registerChat(chatId) {
  if (!subscribers.has(chatId)) {
    subscribers.add(chatId);
    saveSubscribers();
  }
}

// Initialize Telegraf with extended handler timeout
const bot = new Telegraf(token, {
  handlerTimeout: 900000, // 15 minutes
});

let isRunning = false;

// 📬 Reply Tracker Notification Handler
startReplyTracker((reply) => {
  const alertText = `
🚨 *NEW LEAD REPLY RECEIVED!*
🏢 *Business:* *${reply.businessName}*
📧 *From:* \`${reply.fromEmail}\`
📝 *Subject:* \`${reply.subject}\`
⏰ *Time:* _${reply.date}_

💬 *Message Preview:*
"${reply.snippet}"

👉 _Check your Gmail (${config.gmailUser}) to reply directly!_
`;

  subscribers.forEach((chatId) => {
    try {
      bot.telegram.sendMessage(chatId, alertText, { parse_mode: 'Markdown' });
    } catch (err) {
      console.warn(`Could not send reply alert to chat ${chatId}:`, err.message);
    }
  });
});

// Help / Start Command
bot.start((ctx) => {
  registerChat(ctx.chat.id);
  const helpMessage = `
👋 *Welcome to the Lead-Gen Outreach Bot!*

Send me any business niche and area, and I will automatically find qualified local businesses, analyze their websites with AI, and dispatch personalized cold outreach emails with your demo website proposal.

🔔 *Instant Reply Alerts:* Whenever a business replies to your email, I will instantly notify you right here on Telegram!

📌 *How to use:*
1️⃣ *Fast syntax:*
   \`/run plumbers in Miami, FL 10\`
   \`/run dentists in Austin, TX 5\`
   \`/run roofers in Dallas, TX\`

2️⃣ *Or simply type naturally:*
   \`nail salons in Miami, FL\`
   \`hvac in Chicago, IL\`

⚙️ *Commands:*
• \`/replies\` — View all received lead replies
• \`/status\` — Check contacted leads ledger
• \`/dryrun on\` or \`/dryrun off\` — Toggle preview mode
• \`/help\` — View this guide
`;
  return ctx.replyWithMarkdown(helpMessage);
});

bot.help((ctx) => {
  registerChat(ctx.chat.id);
  return ctx.replyWithMarkdown(`
📌 *Examples:*
• \`dentists in Austin, TX\`
• \`nail salons in Miami, FL 10\`
• \`/run real estate in Phoenix, AZ 10\`
• \`/replies\` (view responses from prospects)
• \`/status\`
• \`/dryrun on\` (preview only)
• \`/dryrun off\` (send real emails)
`);
});

// Status Command
bot.command('status', (ctx) => {
  registerChat(ctx.chat.id);
  try {
    const contactedPath = path.resolve(process.cwd(), 'contacted.json');
    let totalEmails = 0;
    let totalPlaces = 0;
    if (fs.existsSync(contactedPath)) {
      const data = JSON.parse(fs.readFileSync(contactedPath, 'utf-8'));
      totalEmails = Object.keys(data.emails || {}).length;
      totalPlaces = Object.keys(data.placeIds || {}).length;
    }

    const repliesCount = getAllReplies().length;

    ctx.replyWithMarkdown(`📊 *Outreach Ledger Status*\n• Unique Emails Contacted: *${totalEmails}*\n• Replies Received: *${repliesCount}*\n• Places Processed: *${totalPlaces}*\n• Sender: \`${config.fromName} (${config.gmailUser})\`\n• Mode: *${config.dryRun ? 'DRY RUN (Preview)' : '⚡ LIVE (Sending)'}*`);
  } catch (err) {
    ctx.reply(`⚠️ Could not read ledger: ${err.message}`);
  }
});

// Replies Command
bot.command('replies', (ctx) => {
  registerChat(ctx.chat.id);
  const replies = getAllReplies();
  if (replies.length === 0) {
    return ctx.replyWithMarkdown('📭 *No replies received yet.* (When prospects reply to your emails, you will receive instant alerts here!).');
  }

  let text = `📬 *Recent Replies (${replies.length}):*\n\n`;
  replies.slice(-5).reverse().forEach((r, idx) => {
    text += `*${idx + 1}. ${r.businessName}* (\`${r.fromEmail}\`)\n` +
      `⏰ _${r.date}_\n` +
      `💬 "${r.snippet}"\n\n`;
  });

  return ctx.replyWithMarkdown(text);
});

// Toggle Dry Run
bot.command('dryrun', (ctx) => {
  registerChat(ctx.chat.id);
  const parts = ctx.message.text.split(' ');
  const arg = parts[1] ? parts[1].toLowerCase() : '';

  if (arg === 'on') {
    config.dryRun = true;
    ctx.replyWithMarkdown('🛡️ *Dry Run Enabled* (Drafts will only be previewed in console/logs, no real emails sent).');
  } else if (arg === 'off') {
    config.dryRun = false;
    ctx.replyWithMarkdown('⚡ *Live Sending Enabled* (Real emails will be sent from your Gmail account).');
  } else {
    ctx.replyWithMarkdown(`Current mode: *${config.dryRun ? 'DRY RUN (Preview)' : '⚡ LIVE (Sending)'}*\nUse \`/dryrun on\` or \`/dryrun off\` to toggle.`);
  }
});

// Campaign Trigger Function (Runs asynchronously without blocking Telegraf polling)
async function triggerCampaign(chatId, niche, region, count = 10) {
  if (isRunning) {
    bot.telegram.sendMessage(chatId, '⚠️ Another campaign is currently running. Please wait for it to finish.');
    return;
  }

  isRunning = true;

  try {
    await runCampaign({
      niche,
      region,
      maxResults: count,
      dryRun: config.dryRun,
      onProgress: async (updateText) => {
        try {
          await bot.telegram.sendMessage(chatId, updateText, { parse_mode: 'Markdown' });
        } catch (e) {
          await bot.telegram.sendMessage(chatId, updateText.replace(/[*_`]/g, ''));
        }
      },
    });
  } catch (err) {
    bot.telegram.sendMessage(chatId, `❌ Campaign Error: ${err.message}`);
  } finally {
    isRunning = false;
  }
}

// /run command
bot.command('run', (ctx) => {
  const chatId = ctx.chat.id;
  registerChat(chatId);
  const text = ctx.message.text.replace(/^\/run\s+/i, '').trim();
  const inIndex = text.toLowerCase().lastIndexOf(' in ');
  if (inIndex === -1) {
    return ctx.replyWithMarkdown('⚠️ Please specify region using the word "in", e.g.:\n`/run dentists in Austin, TX 10`');
  }

  const niche = text.slice(0, inIndex).trim();
  let rest = text.slice(inIndex + 4).trim();

  let count = 10;
  const words = rest.split(' ');
  const lastWord = words[words.length - 1];
  if (/^\d+$/.test(lastWord)) {
    count = parseInt(lastWord, 10);
    rest = words.slice(0, words.length - 1).join(' ').trim();
  }

  const region = rest;
  // Trigger in background non-blocking
  setImmediate(() => triggerCampaign(chatId, niche, region, count));
});

// Natural text listener
bot.on('text', (ctx) => {
  const chatId = ctx.chat.id;
  registerChat(chatId);
  const text = ctx.message.text.trim();
  if (text.startsWith('/')) return;

  const inIndex = text.toLowerCase().lastIndexOf(' in ');
  if (inIndex !== -1) {
    const niche = text.slice(0, inIndex).trim();
    let rest = text.slice(inIndex + 4).trim();

    let count = 10;
    const words = rest.split(' ');
    const lastWord = words[words.length - 1];
    if (/^\d+$/.test(lastWord)) {
      count = parseInt(lastWord, 10);
      rest = words.slice(0, words.length - 1).join(' ').trim();
    }
    const region = rest;

    // Trigger in background non-blocking
    setImmediate(() => triggerCampaign(chatId, niche, region, count));
  } else {
    return ctx.replyWithMarkdown(`💡 To start a campaign, send: \`<niche> in <region>\` (e.g. \`dentists in Austin, TX\`) or type /help.`);
  }
});

bot.launch().then(() => {
  console.log('🤖 Telegram Bot + Reply Tracker is live and connected! Waiting for messages...\n');
});

// Catch unhandled errors gracefully so the process never crashes
bot.catch((err, ctx) => {
  console.error(`Telegram Bot Error for ${ctx.updateType}:`, err);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
