const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { config } = require('../config');
const { sendTelegramAlert } = require('../notifier');

console.log('📡 [Monitoring Agent] Starting service...');

const inboxesJsonPath = path.resolve(process.cwd(), 'config/inboxes.json');

const updateReplied = db.prepare(`
  UPDATE sent_log SET replied = 1 WHERE email = ?
`);

const updateBounced = db.prepare(`
  UPDATE sent_log SET bounced = 1 WHERE email = ?
`);

const insertSuppression = db.prepare(`
  INSERT INTO suppression (email, reason, added_at)
  VALUES (?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(email) DO UPDATE SET reason = excluded.reason
`);

const recordInboxHealth = db.prepare(`
  INSERT INTO inbox_health (inbox_id, bounce_rate, complaint_rate, recorded_at)
  VALUES (?, ?, 0.0, CURRENT_TIMESTAMP)
`);

const pauseInbox = db.prepare(`
  UPDATE inboxes SET health_status = 'paused' WHERE id = ?
`);

const resetDailyCounters = db.prepare(`
  UPDATE inboxes SET sent_today = 0, last_reset = CURRENT_TIMESTAMP
  WHERE DATE(last_reset) < DATE('now')
`);

function getMonitoredInboxes() {
  if (fs.existsSync(inboxesJsonPath)) {
    try {
      const list = JSON.parse(fs.readFileSync(inboxesJsonPath, 'utf8'));
      if (Array.isArray(list) && list.length > 0) return list;
    } catch (e) {}
  }

  // Fallback to default .env account
  if (config.gmailUser && config.gmailAppPassword) {
    return [
      {
        id: 'default',
        email: config.gmailUser,
        appPassword: config.gmailAppPassword,
      },
    ];
  }
  return [];
}

async function checkInboxDeliverability(inbox) {
  if (!inbox.email || !inbox.appPassword) return;

  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: {
      user: inbox.email,
      pass: inbox.appPassword,
    },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      // Fetch recent 50 messages
      const status = await client.status('INBOX', { messages: true });
      const totalMessages = status.messages || 0;
      if (totalMessages === 0) return;

      const startSeq = Math.max(1, totalMessages - 40);
      const messages = client.fetch(`${startSeq}:*`, { envelope: true, source: true });

      for await (const msg of messages) {
        const fromAddress = (msg.envelope?.from?.[0]?.address || '').toLowerCase().trim();
        const subject = (msg.envelope?.subject || '').toLowerCase();

        // 1. Detect Bounces / NDRs
        const isBounce =
          fromAddress.includes('mailer-daemon') ||
          fromAddress.includes('postmaster') ||
          subject.includes('delivery status notification') ||
          subject.includes('failure notice') ||
          subject.includes('undelivered mail');

        if (isBounce) {
          let bouncedRecipient = null;
          try {
            const parsed = await simpleParser(msg.source);
            const textContent = (parsed.text || '') + ' ' + (parsed.html || '');
            const emailMatch = textContent.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
            if (emailMatch && emailMatch[0] !== inbox.email) {
              bouncedRecipient = emailMatch[0].toLowerCase();
            }
          } catch (err) {}

          if (bouncedRecipient) {
            console.warn(`🚨 [Monitoring Agent] Bounce detected for recipient: ${bouncedRecipient} on inbox ${inbox.id}`);
            updateBounced.run(bouncedRecipient);
            insertSuppression.run(bouncedRecipient, `NDR bounce on inbox ${inbox.id}`);
          }
          continue;
        }

        // 2. Detect Replies from Contacted Leads
        if (fromAddress) {
          const matchedSent = db.prepare('SELECT id, lead_id FROM sent_log WHERE email = ?').get(fromAddress);
          if (matchedSent) {
            updateReplied.run(fromAddress);
            console.log(`🎉 [Monitoring Agent] Reply detected from client: ${fromAddress}!`);
            await sendTelegramAlert(
              `🎉 *CLIENT REPLY DETECTED!*\n\n` +
              `📧 *From:* \`${fromAddress}\`\n` +
              `📬 *Inbox:* \`${inbox.id}\`\n` +
              `💬 *Subject:* ${msg.envelope?.subject || 'Re: Website'}\n\n` +
              `_Lead has been marked as replied in the pipeline database._`
            );
          }
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (err) {
    console.warn(`[Monitoring Agent] IMAP check error for ${inbox.email}:`, err.message);
  }
}

async function evaluateInboxHealthAndAlerts() {
  const inboxes = db.prepare('SELECT id, email, sent_today, daily_cap, health_status FROM inboxes').all();

  for (const inbox of inboxes) {
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total_sent,
        SUM(CASE WHEN bounced = 1 THEN 1 ELSE 0 END) as total_bounced
      FROM sent_log
      WHERE inbox_id = ?
    `).get(inbox.id);

    const totalSent = stats?.total_sent || 0;
    const totalBounced = stats?.total_bounced || 0;

    if (totalSent >= 10) {
      const bounceRate = totalBounced / totalSent;
      recordInboxHealth.run(inbox.id, bounceRate);

      if (bounceRate > 0.05 && inbox.health_status === 'active') {
        console.error(`🚨 [Monitoring Agent] High bounce rate (${(bounceRate * 100).toFixed(1)}%) for inbox ${inbox.id}. Pausing!`);
        pauseInbox.run(inbox.id);
        await sendTelegramAlert(
          `🚨 *SAFETY ALERT: INBOX PAUSED!*\n\n` +
          `📬 *Inbox ID:* \`${inbox.id}\` (${inbox.email})\n` +
          `⚠️ *Bounce Rate:* ${(bounceRate * 100).toFixed(1)}% (${totalBounced}/${totalSent})\n` +
          `🛑 *Status:* Paused automatically to protect domain reputation.`
        );
      }
    }
  }
}

async function runMonitoringCycle() {
  console.log('🔄 [Monitoring Agent] Running deliverability & inbox health audit...');
  
  // 1. Midnight counter reset check
  resetDailyCounters.run();

  // 2. Poll IMAP for bounces and replies
  const inboxes = getMonitoredInboxes();
  for (const inbox of inboxes) {
    await checkInboxDeliverability(inbox);
  }

  // 3. Compute bounce rates and safety triggers
  await evaluateInboxHealthAndAlerts();
}

// Run immediately on boot, then every 3 minutes
runMonitoringCycle();
setInterval(runMonitoringCycle, 3 * 60 * 1000);

module.exports = { runMonitoringCycle };
