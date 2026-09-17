const fs = require('fs');
const path = require('path');
const db = require('./index');

function runSeed(dryRun = false) {
  console.log(`🌱 [DB Seed] Starting seed migration${dryRun ? ' (DRY RUN)' : ''}...`);

  const contactedPath = path.resolve(process.cwd(), 'contacted.json');
  const inboxesPath = path.resolve(process.cwd(), 'config/inboxes.json');

  let importedSuppression = 0;
  let importedSentLog = 0;
  let importedInboxes = 0;

  const insertSuppression = db.prepare(`
    INSERT INTO suppression (email, reason, added_at)
    VALUES (?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET reason = excluded.reason
  `);

  const insertSentLog = db.prepare(`
    INSERT INTO sent_log (lead_id, inbox_id, email, sent_at, bounced, replied)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertInbox = db.prepare(`
    INSERT INTO inboxes (id, email, from_name, niches, daily_cap, sent_today, health_status, last_reset)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      email = excluded.email,
      from_name = excluded.from_name,
      niches = excluded.niches,
      daily_cap = excluded.daily_cap,
      health_status = excluded.health_status
  `);

  // 1. Seed Inboxes from config/inboxes.json
  if (fs.existsSync(inboxesPath)) {
    try {
      const inboxes = JSON.parse(fs.readFileSync(inboxesPath, 'utf8'));
      for (const inbox of inboxes) {
        if (!dryRun) {
          const nichesStr = Array.isArray(inbox.niches) ? inbox.niches.join(',') : (inbox.niches || '*');
          insertInbox.run(
            inbox.id,
            inbox.email,
            inbox.fromName || 'Outreach',
            nichesStr,
            inbox.dailyCap || 100,
            0,
            'active',
            new Date().toISOString()
          );
        }
        importedInboxes++;
      }
      console.log(`✅ [DB Seed] Loaded ${importedInboxes} inbox accounts from config/inboxes.json`);
    } catch (err) {
      console.warn(`⚠️ [DB Seed] Error reading config/inboxes.json:`, err.message);
    }
  }

  // 2. Seed contacted leads from contacted.json
  if (fs.existsSync(contactedPath)) {
    try {
      const contactedData = JSON.parse(fs.readFileSync(contactedPath, 'utf8'));
      const emailsMap = contactedData.emails || {};
      const placeIdsMap = contactedData.placeIds || {};

      const processedEmails = new Set();

      const processEntry = (item) => {
        if (!item || !item.email) return;
        const email = String(item.email).trim().toLowerCase();
        if (!email || !email.includes('@') || processedEmails.has(email)) return;
        processedEmails.add(email);

        const sentAt = item.lastContactedAt || item.contactedAt || new Date().toISOString();
        const reason = `Historical contacted lead: ${item.name || 'Unknown'}`;

        if (!dryRun) {
          insertSuppression.run(email, reason, sentAt);
          insertSentLog.run(
            null,
            'historical_migration',
            email,
            sentAt,
            0,
            0
          );
        }

        importedSuppression++;
        importedSentLog++;
      };

      for (const item of Object.values(emailsMap)) {
        processEntry(item);
      }
      for (const item of Object.values(placeIdsMap)) {
        processEntry(item);
      }

      console.log(`✅ [DB Seed] Migrated ${importedSuppression} unique emails into 'suppression' and 'sent_log'`);
    } catch (err) {
      console.warn(`⚠️ [DB Seed] Error reading contacted.json:`, err.message);
    }
  } else {
    console.log(`ℹ️ [DB Seed] No contacted.json found; skipping historical import.`);
  }

  console.log(`🎉 [DB Seed] Seed completed successfully!`);
}

if (require.main === module) {
  const isDryRun = process.argv.includes('--dry-run');
  try {
    runSeed(isDryRun);
    process.exit(0);
  } catch (err) {
    console.error('❌ [DB Seed Failed]:', err);
    process.exit(1);
  }
}

module.exports = { runSeed };
