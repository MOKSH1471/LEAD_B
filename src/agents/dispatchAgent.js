const { Worker } = require('bullmq');
const path = require('path');
const fs = require('fs');
const { redisConnection, dispatchQueue } = require('../queues');
const db = require('../db');
const { config } = require('../config');
const { sendEmail } = require('../emailSender');

console.log('📬 [Dispatch Agent] Starting worker...');

const businessHoursStart = parseInt(process.env.BUSINESS_HOURS_START || '9', 10);
const businessHoursEnd = parseInt(process.env.BUSINESS_HOURS_END || '18', 10);
const paceMinMs = parseInt(process.env.DISPATCH_PACE_MIN_MS || '25000', 10);
const paceMaxMs = parseInt(process.env.DISPATCH_PACE_MAX_MS || '40000', 10);

const inboxesJsonPath = path.resolve(process.cwd(), 'config/inboxes.json');

function getInboxCredentials(inboxId) {
  if (fs.existsSync(inboxesJsonPath)) {
    try {
      const inboxes = JSON.parse(fs.readFileSync(inboxesJsonPath, 'utf8'));
      const found = inboxes.find((i) => i.id === inboxId);
      if (found) return found;
    } catch (e) {}
  }
  return {
    email: config.gmailUser,
    fromName: config.fromName,
    appPassword: config.gmailAppPassword,
  };
}

function isWithinBusinessHours() {
  const currentHour = new Date().getHours();
  return currentHour >= businessHoursStart && currentHour < businessHoursEnd;
}

function getMsUntilNextBusinessWindow() {
  const now = new Date();
  const next = new Date(now);

  if (now.getHours() < businessHoursStart) {
    next.setHours(businessHoursStart, 0, 0, 0);
  } else {
    // Past business hours, schedule for 9 AM tomorrow
    next.setDate(next.getDate() + 1);
    next.setHours(businessHoursStart, 0, 0, 0);
  }
  return Math.max(1000, next.getTime() - now.getTime());
}

const selectCandidateInboxes = db.prepare(`
  SELECT id, email, from_name, niches, daily_cap, sent_today, health_status, last_sent_at
  FROM inboxes
  WHERE health_status = 'active' AND sent_today < daily_cap
  ORDER BY last_sent_at ASC
`);

const updateInboxSent = db.prepare(`
  UPDATE inboxes
  SET sent_today = sent_today + 1, last_sent_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);

const updateSendQueueStatus = db.prepare(`
  UPDATE send_queue SET status = ? WHERE id = ?
`);

const insertSentLog = db.prepare(`
  INSERT INTO sent_log (lead_id, inbox_id, email, sent_at, bounced, replied)
  VALUES (?, ?, ?, CURRENT_TIMESTAMP, 0, 0)
`);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const worker = new Worker(
  'dispatch',
  async (job) => {
    const { sendQueueId, leadVerifiedId, email, businessName, subject, body, niche } = job.data;
    console.log(`📤 [Dispatch] Job #${job.id}: Preparing dispatch for "${businessName}" <${email}> (${niche})...`);

    // 1. Business Hours Gate (skip gate in dry-run mode for instant testing)
    if (!config.dryRun && !isWithinBusinessHours()) {
      const waitMs = getMsUntilNextBusinessWindow();
      const nextWindowHours = (waitMs / (1000 * 60 * 60)).toFixed(1);
      console.log(`   ⏰ Outside business hours (${businessHoursStart}:00–${businessHoursEnd}:00). Pausing job for ${nextWindowHours} hours.`);
      
      // Delay job until next window
      await dispatchQueue.add('dispatch-email', job.data, { delay: waitMs });
      return { delayed: true, waitMs };
    }

    // 2. Select Niche-Matched LRU Inbox
    const activeInboxes = selectCandidateInboxes.all();
    if (!activeInboxes || activeInboxes.length === 0) {
      console.warn(`   ⚠️ No active inboxes available under daily cap. Re-queueing in 15 minutes...`);
      await dispatchQueue.add('dispatch-email', job.data, { delay: 15 * 60 * 1000 });
      return { delayed: true, reason: 'no_available_inbox' };
    }

    // Match by niche tag
    const targetNiche = (niche || '').toLowerCase();
    const matchedInboxes = activeInboxes.filter((inbox) => {
      const tags = (inbox.niches || '*').split(',').map((t) => t.trim().toLowerCase());
      return tags.includes('*') || tags.includes(targetNiche);
    });

    const chosenInbox = matchedInboxes.length > 0 ? matchedInboxes[0] : activeInboxes[0];
    console.log(`   🎯 Selected inbox: [${chosenInbox.id}] ${chosenInbox.email} (sent today: ${chosenInbox.sent_today}/${chosenInbox.daily_cap})`);

    // 3. Natural pacing delay with random jitter (e.g. 25-40s)
    const randomDelay = Math.floor(Math.random() * (paceMaxMs - paceMinMs + 1)) + paceMinMs;
    console.log(`   ⏳ Applying organic send pacing: ${(randomDelay / 1000).toFixed(1)}s...`);
    await sleep(config.dryRun ? 1000 : randomDelay);

    // 4. Retrieve credentials and send
    const creds = getInboxCredentials(chosenInbox.id);

    try {
      const sendResult = await sendEmail({
        to: email,
        subject,
        body,
        businessName,
        fromEmail: creds.email || chosenInbox.email,
        fromName: creds.fromName || chosenInbox.from_name,
        appPassword: creds.appPassword,
      });

      if (sendResult.success) {
        insertSentLog.run(leadVerifiedId, chosenInbox.id, email);
        updateInboxSent.run(chosenInbox.id);
        updateSendQueueStatus.run('sent', sendQueueId);

        console.log(`   🎉 [Dispatch Success] Email to ${email} successfully logged.`);
        return { success: true, email, inboxId: chosenInbox.id, dryRun: !!sendResult.dryRun };
      } else {
        throw new Error(sendResult.error || 'Unknown send error');
      }
    } catch (err) {
      console.error(`   ❌ [Dispatch Error] Failed to send to ${email}:`, err.message);
      updateSendQueueStatus.run('failed', sendQueueId);
      throw err;
    }
  },
  {
    connection: redisConnection,
    concurrency: 1, // Single dispatcher to ensure strict inter-email pacing
  }
);

worker.on('failed', (job, err) => {
  console.error(`❌ [Dispatch Agent] Job #${job?.id} failed:`, err.message);
});

module.exports = worker;
