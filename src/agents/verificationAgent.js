const { Worker } = require('bullmq');
const dns = require('dns').promises;
const { redisConnection, personalizationQueue } = require('../queues');
const db = require('../db');
const { checkWebsite } = require('../websiteCheck');

console.log('🛡️ [Verification Agent] Starting worker...');

const checkSuppression = db.prepare('SELECT email FROM suppression WHERE email = ?');
const checkSentLog = db.prepare('SELECT email FROM sent_log WHERE email = ?');
const checkVerified = db.prepare('SELECT email FROM leads_verified WHERE email = ?');

const insertVerified = db.prepare(`
  INSERT INTO leads_verified (raw_id, email, domain, mx_valid, verified_at)
  VALUES (?, ?, ?, ?, ?)
`);

const updateRegionStat = db.prepare(`
  INSERT INTO region_stats (region, total_leads, invalid_leads, priority_score)
  VALUES (?, 1, ?, ?)
  ON CONFLICT(region) DO UPDATE SET
    total_leads = total_leads + 1,
    invalid_leads = invalid_leads + excluded.invalid_leads,
    priority_score = ROUND(1.0 - ((CAST(invalid_leads + excluded.invalid_leads AS REAL)) / (total_leads + 1)), 2)
`);

async function verifyMxWithTimeout(domain, timeoutMs = 3500) {
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('MX lookup timed out')), timeoutMs)
  );

  try {
    const mxRecords = await Promise.race([
      dns.resolveMx(domain),
      timeoutPromise,
    ]);
    return Array.isArray(mxRecords) && mxRecords.length > 0;
  } catch (err) {
    return false;
  }
}

const worker = new Worker(
  'verification',
  async (job) => {
    const { leadRawId, businessName, website, niche, region } = job.data;
    console.log(`🔎 [Verification] Job #${job.id}: Verifying lead "${businessName}" (${website || 'No website'})...`);

    if (!website) {
      console.log(`   ⏭️ Skipped: No website provided for "${businessName}".`);
      updateRegionStat.run(region || 'Unknown', 1, 0.0);
      return { verified: false, reason: 'no_website' };
    }

    // 1. Scrape & inspect website for contact email
    let siteInfo;
    try {
      siteInfo = await checkWebsite(website);
    } catch (err) {
      console.log(`   ⚠️ Website scrape failed for ${website}: ${err.message}`);
      updateRegionStat.run(region || 'Unknown', 1, 0.0);
      return { verified: false, reason: 'scrape_error' };
    }

    if (!siteInfo || !siteInfo.live || !siteInfo.email) {
      console.log(`   ⏭️ No valid email found on ${website}.`);
      updateRegionStat.run(region || 'Unknown', 1, 0.0);
      return { verified: false, reason: 'no_email' };
    }

    const email = siteInfo.email.trim().toLowerCase();
    const domain = email.split('@')[1];

    // 2. Suppression and previous contact checks
    if (checkSuppression.get(email)) {
      console.log(`   ⛔ Email ${email} is in suppression list.`);
      return { verified: false, reason: 'suppressed' };
    }

    if (checkSentLog.get(email) || checkVerified.get(email)) {
      console.log(`   ⏭️ Email ${email} was already contacted or verified.`);
      return { verified: false, reason: 'already_contacted' };
    }

    // 3. DNS MX Record Validation (with hard 3.5s timeout)
    const isMxValid = await verifyMxWithTimeout(domain, 3500);
    if (!isMxValid) {
      console.log(`   ❌ Domain ${domain} failed MX validation.`);
      updateRegionStat.run(region || 'Unknown', 1, 0.0);
      return { verified: false, reason: 'invalid_mx' };
    }

    // 4. Save verified lead to DB
    const result = insertVerified.run(
      leadRawId,
      email,
      domain,
      1,
      new Date().toISOString()
    );
    const leadVerifiedId = result.lastInsertRowid;

    // Update region stats with positive validation
    updateRegionStat.run(region || 'Unknown', 0, 1.0);

    // 5. Queue into Personalization Queue
    await personalizationQueue.add('personalize-pitch', {
      leadVerifiedId,
      leadRawId,
      email,
      businessName,
      website: siteInfo.url || website,
      websiteText: siteInfo.text || '',
      websiteTitle: siteInfo.title || '',
      niche,
      region,
    });

    console.log(`   ✅ Lead verified: ${businessName} <${email}> -> queued for personalization.`);
    return { verified: true, email, domain, leadVerifiedId };
  },
  {
    connection: redisConnection,
    concurrency: 5,
  }
);

worker.on('failed', (job, err) => {
  console.error(`❌ [Verification Agent] Job #${job?.id} failed:`, err.message);
});

module.exports = worker;
