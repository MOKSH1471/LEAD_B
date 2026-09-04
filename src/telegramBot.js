const express = require('express');
const { Telegraf } = require('telegraf');
const { config, validateConfig } = require('./config');
const { runCampaign } = require('./pipeline');
const { verifySMTP } = require('./emailSender');
const { startReplyTracker, getAllReplies } = require('./replyTracker');
const { runFollowUpSweep } = require('./followUpEngine');
const { getFollowUpQueueStats } = require('./tracker');
const { startAutopilot, stopAutopilot, getAutopilotStatus } = require('./autopilot');
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
🚨 *NEW CLIENT RESPONSE RECEIVED!*
🏢 *Business:* *${reply.businessName}*
📧 *From:* \`${reply.fromEmail}\`
📝 *Subject:* \`${reply.subject}\`
⏰ *Time:* _${reply.date}_

💬 *Message Preview:*
"${reply.snippet}"

🛑 *Automated follow-ups for this lead have been automatically HALTED.*
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

📌 *Manual Campaign:*
• \`/run <niche> in <city, state> [count]\`
  _Example:_ \`/run gym in Miami, FL 10\`
  _Example:_ \`/run dentists in Austin, TX 5\`
• *Or simply type naturally:*
  \`boutique hotels in Miami, FL 10\`
  \`plumbers in Chicago, IL\`

🤖 *Autopilot Autonomous Hunter (24/7):*
• \`/autopilot on\` — Start automatic client searches & follow-up sweeps
• \`/autopilot off\` — Pause autopilot
• \`/autopilot status\` — View next run, target niches & cities

📬 *Automated Follow-Ups:*
• \`/followups\` — View follow-up queue breakdown (Stage 1 & Stage 2)
• \`/followups run\` — Trigger an immediate follow-up sweep right now

🛑 *Campaign Controls:*
• \`/stop\` or \`/cancel\` — Instantly halts active campaign or sweep

📬 *Lead Tracking & Replies:*
• \`/replies\` — Displays responses received from prospects
• \`/status\` — Full ledger stats, queue state, and system mode

⚙️ *Mode Settings:*
• \`/dryrun on\` — Preview mode (no real emails sent)
• \`/dryrun off\` — Live mode (sends real emails via Gmail)

ℹ️ *Help:*
• \`/help\` — Display this command menu
`;

// Start Command
bot.start((ctx) => {
  registerChat(ctx.chat.id);
  const welcome = `👋 *Welcome to your Lead-Gen & Outreach Bot!*\n` + HELP_TEXT;
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
    const fuStats = getFollowUpQueueStats();
    const apStatus = getAutopilotStatus();

    ctx.replyWithMarkdown(
      `📊 *Lead-Gen Command Center Status*\n\n` +
      `• *Outreach Ledger:* ${totalEmails} emails contacted, ${totalPlaces} places\n` +
      `• *Replies Received:* ${repliesCount} total\n` +
      `• *Follow-Ups Due NOW:* *${fuStats.dueNow}* (Waiting S1: ${fuStats.stage0Waiting}, Waiting S2: ${fuStats.stage1Waiting})\n` +
      `• *Autopilot:* ${apStatus.isActive ? '🟢 RUNNING' : '⚪ STOPPED'}${apStatus.nextRunAt ? ` (Next: ${new Date(apStatus.nextRunAt).toLocaleTimeString()})` : ''}\n` +
      `• *Sender:* \`${config.fromName} (${config.gmailUser})\`\n` +
      `• *Active Task:* *${isRunning ? '🏃 RUNNING' : '💤 IDLE'}*\n` +
      `• *Mode:* *${config.dryRun ? 'DRY RUN (Preview)' : '⚡ LIVE (Sending)'}*`
    );
  } catch (err) {
    ctx.reply(`⚠️ Could not read ledger: ${err.message}`);
  }
});

// Autopilot Command
bot.command('autopilot', async (ctx) => {
  registerChat(ctx.chat.id);
  const parts = ctx.message.text.split(' ');
  const sub = parts[1] ? parts[1].toLowerCase() : '';

  if (sub === 'on') {
    const started = startAutopilot({
      onProgress: async (msg) => {
        subscribers.forEach((chatId) => {
          try {
            bot.telegram.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
          } catch (e) {
            bot.telegram.sendMessage(chatId, msg.replace(/[*_`]/g, ''));
          }
        });
      },
    });
    if (started) {
      ctx.replyWithMarkdown('🤖 *Autopilot Started!*\nThe bot will now autonomously search clients and send multi-stage follow-ups around the clock.\nSend `/autopilot status` to view upcoming runs.');
    } else {
      ctx.replyWithMarkdown('ℹ️ *Autopilot is already active!* Send `/autopilot status` for details.');
    }
  } else if (sub === 'off') {
    stopAutopilot();
    ctx.replyWithMarkdown('🛑 *Autopilot Stopped.* (Automatic client searching and follow-ups are paused).');
  } else if (sub === 'status') {
    const st = getAutopilotStatus();
    ctx.replyWithMarkdown(
      `🤖 *Autopilot Engine Status*\n` +
      `• Status: *${st.isActive ? '🟢 RUNNING (24/7 Autopilot)' : '⚪ STOPPED'}*\n` +
      `• Current Cycle: *${st.isCycleInProgress ? '🏃 Actively executing' : '💤 Idle (waiting for next run)'}*\n` +
      `• Interval: *Every ${st.intervalHours} hours*\n` +
      `• Batch Size: *${st.batchSize} leads per run*\n` +
      `• Cycles Completed: *${st.totalCyclesCompleted}*\n` +
      `• Next Run At: _${st.nextRunAt ? new Date(st.nextRunAt).toLocaleString() : 'Not scheduled'}_\n` +
      `• Next Target: *${st.nextTarget.niche}* in *${st.nextTarget.region}*\n` +
      `• Configured Niches: \`${st.configuredNiches.join(', ')}\`\n` +
      `• Configured Cities: \`${st.configuredRegions.join('; ')}\``
    );
  } else {
    const st = getAutopilotStatus();
    ctx.replyWithMarkdown(
      `🤖 *Autopilot Autonomous Hunter*\n` +
      `Current State: *${st.isActive ? '🟢 RUNNING' : '⚪ STOPPED'}*\n\n` +
      `Commands:\n` +
      `• \`/autopilot on\` — Start 24/7 autonomous prospecting & follow-ups\n` +
      `• \`/autopilot off\` — Stop autopilot\n` +
      `• \`/autopilot status\` — View schedule and upcoming targets`
    );
  }
});

// Follow-Ups Command
bot.command('followups', async (ctx) => {
  registerChat(ctx.chat.id);
  const parts = ctx.message.text.split(' ');
  const sub = parts[1] ? parts[1].toLowerCase() : '';

  if (sub === 'run' || sub === 'now') {
    if (isRunning) {
      return ctx.replyWithMarkdown('⚠️ A task is currently running. Send /stop to halt it first.');
    }
    isRunning = true;
    shouldStopCurrentCampaign = false;
    ctx.replyWithMarkdown('📬 *Starting manual follow-up sweep...*');
    try {
      await runFollowUpSweep({
        dryRun: config.dryRun,
        onProgress: async (msg) => {
          try {
            await ctx.replyWithMarkdown(msg);
          } catch (e) {
            await ctx.reply(msg.replace(/[*_`]/g, ''));
          }
        },
        shouldAbort: () => shouldStopCurrentCampaign,
      });
    } catch (err) {
      ctx.reply(`❌ Follow-up sweep error: ${err.message}`);
    } finally {
      isRunning = false;
      shouldStopCurrentCampaign = false;
    }
  } else {
    const stats = getFollowUpQueueStats();
    ctx.replyWithMarkdown(
      `📬 *Automated Follow-Up Queue Breakdown*\n` +
      `• ⚡ *Due for Follow-Up NOW:* *${stats.dueNow}*\n` +
      `• ⏳ Waiting for Stage 1 (Day 3 Soft Bump): *${stats.stage0Waiting}*\n` +
      `• ⏳ Waiting for Stage 2 (Day 7 Breakup): *${stats.stage1Waiting}*\n` +
      `• 🏁 Completed Follow-Up Sequence: *${stats.stage2Completed}*\n` +
      `• 💬 Prospects Who Replied: *${stats.totalReplied}*\n` +
      `• Total Email Leads in Ledger: *${stats.totalTracked}*\n\n` +
      `👉 Send \`/followups run\` to execute an immediate follow-up sweep right now!`
    );
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

// Express Server
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const secretPath = `/webhook/telegram/${token.replace(/[^a-zA-Z0-9]/g, '')}`;

app.get('/', (req, res) => {
  res.send('Galileo & Duke Lead Bot is running!\n');
});

// Telegram Webhook Handler
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

const WEBHOOK_URL = process.env.RENDER_EXTERNAL_URL || process.env.WEBHOOK_URL;

async function startBot() {
  if (WEBHOOK_URL) {
    const fullWebhookUrl = `${WEBHOOK_URL}${secretPath}`;
    app.listen(PORT, async () => {
      console.log(`🌐 Cloud Webhook Server running on port ${PORT}`);
      try {
        await bot.telegram.setWebhook(fullWebhookUrl);
        console.log(`⚡ Telegram Webhook linked to: ${fullWebhookUrl}`);
      } catch (e) {
        console.warn('⚠️ Webhook link note:', e.message);
      }
    });
  } else {
    // RUNNING LOCALLY: Clear any cloud webhook so Telegram routes all messages directly to this laptop!
    try {
      await bot.telegram.deleteWebhook({ drop_pending_updates: false });
      console.log('⚡ Cleared cloud webhook. Connecting directly to Telegram via local polling...');
    } catch (e) {}

    bot.launch().then(async () => {
      console.log('🤖 Telegram Bot is connected and running locally on your laptop!\n');

      // Verify Gmail SMTP works at startup — catch credential/port issues immediately
      const smtpOk = await verifySMTP();
      if (!smtpOk && !config.dryRun) {
        const warnMsg = '⚠️ *SMTP Warning:* Gmail connection failed at startup.\nEmails will NOT be sent until this is fixed.\n→ Check `GMAIL_USER` and `GMAIL_APP_PASSWORD` in your environment variables.';
        subscribers.forEach(chatId => {
          try { bot.telegram.sendMessage(chatId, warnMsg, { parse_mode: 'Markdown' }); } catch (e) {}
        });
      }

      if (config.autopilotEnabled) {
        console.log('🤖 AUTOPILOT_ENABLED=true: Auto-starting background client prospecting & follow-ups...');
        startAutopilot({
          onProgress: async (msg) => {
            subscribers.forEach((chatId) => {
              try {
                bot.telegram.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
              } catch (e) {
                bot.telegram.sendMessage(chatId, msg.replace(/[*_`]/g, ''));
              }
            });
          },
        });
      }
    });
  }
}

startBot();

bot.catch((err, ctx) => {
  console.error(`Telegram Bot Error for ${ctx.updateType}:`, err);
});

process.once('SIGINT', () => {
  try {
    bot.stop('SIGINT');
    process.exit(0);
  } catch (e) {}
});
process.once('SIGTERM', () => {
  try {
    bot.stop('SIGTERM');
    process.exit(0);
  } catch (e) {}
});
