const express = require('express');
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

const bot = new Telegraf(token, {
  handlerTimeout: 900000,
});

let isRunning = false;
let shouldStopCurrentCampaign = false;

// 📬 Send alert to Telegram subscribers when a lead replies
function notifyLeadReply(reply) {
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
}

// Start reply tracker
const replyTracker = startReplyTracker(notifyLeadReply);

const HELP_TEXT = `
🤖 *Lead-Gen Outreach Bot — Command Center*

📌 *Start a Campaign:*
• \`/run <niche> in <city, state> [count]\`
  _Example:_ \`/run gym in Miami, FL 10\`
  _Example:_ \`/run dentists in Austin, TX 5\`
• *Or simply type naturally:*
  \`boutique hotels in Miami, FL 10\`
  \`plumbers in Chicago, IL\`

🛑 *Campaign Controls:*
• \`/stop\` or \`/cancel\`
  _Instantly halts the active campaign immediately._

📬 *Lead Tracking & Replies:*
• \`/replies\`
  _Displays all responses received from prospects with email previews._
• \`/status\`
  _Shows ledger stats: total emails sent, active task state, and mode._

⚙️ *Mode Settings:*
• \`/dryrun on\` — Preview mode (no real emails sent)
• \`/dryrun off\` — Live mode (sends real emails via Gmail)

ℹ️ *Help:*
• \`/help\` — Display this command menu
`;

// Start Command
bot.start((ctx) => {
  registerChat(ctx.chat.id);
  const welcome = `👋 *Welcome to your 24/7 Lead-Gen & Outreach Bot!*\n` + HELP_TEXT;
  return ctx.replyWithMarkdown(welcome);
});

// Help Command
bot.help((ctx) => {
  registerChat(ctx.chat.id);
  return ctx.replyWithMarkdown(HELP_TEXT);
});

// Stop / Cancel Command
bot.command(['stop', 'cancel'], (ctx) => {
  registerChat(ctx.chat.id);
  if (!isRunning) {
    return ctx.replyWithMarkdown('ℹ️ *No campaign is currently running.*');
  }
  shouldStopCurrentCampaign = true;
  return ctx.replyWithMarkdown('🛑 *Stopping campaign...* (Halting immediately).');
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

    ctx.replyWithMarkdown(`📊 *Outreach Ledger Status*\n• Unique Emails Contacted: *${totalEmails}*\n• Replies Received: *${repliesCount}*\n• Places Processed: *${totalPlaces}*\n• Sender: \`${config.fromName} (${config.gmailUser})\`\n• Active Task: *${isRunning ? '🏃 RUNNING' : '💤 IDLE'}*\n• Mode: *${config.dryRun ? 'DRY RUN (Preview)' : '⚡ LIVE (Sending)'}*`);
  } catch (err) {
    ctx.reply(`⚠️ Could not read ledger: ${err.message}`);
  }
});

// Replies Command
bot.command('replies', async (ctx) => {
  registerChat(ctx.chat.id);
  if (replyTracker && typeof replyTracker.checkNow === 'function') {
    await replyTracker.checkNow();
  }

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

// Campaign Trigger Function
async function triggerCampaign(chatId, niche, region, count = 10) {
  if (isRunning) {
    bot.telegram.sendMessage(chatId, '⚠️ Another campaign is currently running. Send /stop to halt it first.');
    return;
  }

  isRunning = true;
  shouldStopCurrentCampaign = false;

  try {
    await runCampaign({
      niche,
      region,
      maxResults: count,
      dryRun: config.dryRun,
      shouldAbort: () => shouldStopCurrentCampaign,
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
    shouldStopCurrentCampaign = false;
  }
}

// /run command
bot.command('run', (ctx) => {
  const chatId = ctx.chat.id;
  registerChat(chatId);
  const text = ctx.message.text.replace(/^\/run\s+/i, '').trim();
  const inIndex = text.toLowerCase().lastIndexOf(' in ');
  if (inIndex === -1) {
    return ctx.replyWithMarkdown('⚠️ Please specify region using the word "in", e.g.:\n`/run gym in Miami, FL 10`');
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

    setImmediate(() => triggerCampaign(chatId, niche, region, count));
  } else {
    return ctx.replyWithMarkdown(`💡 To start a campaign, send: \`<niche> in <region>\` (e.g. \`gym in Miami, FL 10\`) or type /help.`);
  }
});

// 🌐 Express Server for Cloud Health Checks & Webhooks
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const secretPath = `/webhook/telegram/${token.replace(/[^a-zA-Z0-9]/g, '')}`;

// Health Check Endpoint
app.get('/', (req, res) => {
  res.send('Galileo & Duke Lead Bot is running live!\n');
});

// Telegram Webhook Handler (Instantly ack 200 to prevent connection timeouts)
app.post(secretPath, (req, res) => {
  res.status(200).send('OK');
  setImmediate(() => {
    try {
      bot.handleUpdate(req.body);
    } catch (err) {
      console.error('Webhook handle error:', err);
    }
  });
});

// Gmail Push Webhook
app.post('/webhook/gmail', async (req, res) => {
  res.status(200).send('OK');
  if (replyTracker && typeof replyTracker.checkNow === 'function') {
    await replyTracker.checkNow();
  }
});

const WEBHOOK_URL = process.env.RENDER_EXTERNAL_URL || process.env.WEBHOOK_URL;

app.listen(PORT, async () => {
  console.log(`🌐 Server active on port ${PORT}`);
  if (WEBHOOK_URL) {
    const fullWebhookUrl = `${WEBHOOK_URL}${secretPath}`;
    try {
      await bot.telegram.setWebhook(fullWebhookUrl);
      console.log(`⚡ Telegram Webhook linked to: ${fullWebhookUrl}`);
    } catch (e) {
      console.warn('⚠️ Webhook link note:', e.message);
    }
  } else {
    bot.launch().then(() => console.log('🤖 Polling started.'));
  }
});

bot.catch((err, ctx) => {
  console.error(`Telegram Bot Error for ${ctx.updateType}:`, err);
});

// Safe shutdown
process.once('SIGINT', () => {
  try {
    process.exit(0);
  } catch (e) {}
});
process.once('SIGTERM', () => {
  try {
    process.exit(0);
  } catch (e) {}
});
