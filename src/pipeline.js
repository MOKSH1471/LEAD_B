const fs = require('fs');
const path = require('path');
const { config } = require('./config');
const { searchPlaces } = require('./placesSearch');
const { searchPlacesOSM } = require('./osmSearch');
const { searchNominatim } = require('./nominatimSearch');
const { searchWebFallback } = require('./webScraperSearch');
const { checkWebsite } = require('./websiteCheck');
const { analyzeSite } = require('./analyzer');
const { sendEmail } = require('./emailSender');
const { isPlaceContacted, isEmailContacted, recordContacted, logResult } = require('./tracker');

const inboxesJsonPath = path.resolve(process.cwd(), 'config/inboxes.json');
let inboxesCache = null;
let currentInboxIdx = 0;

function getSingleAccount() {
  return {
    email: config.emailUser || config.gmailUser,
    appPassword: config.emailPass || config.gmailAppPassword,
    fromName: config.fromName,
    smtpHost: config.smtpHost,
    smtpPort: config.smtpPort,
    smtpSecure: config.smtpSecure,
  };
}

function getNextRotatedInbox() {
  try {
    if (fs.existsSync(inboxesJsonPath)) {
      inboxesCache = JSON.parse(fs.readFileSync(inboxesJsonPath, 'utf8'));
    }
  } catch (e) {}
  if (inboxesCache && inboxesCache.length > 0) {
    const inbox = inboxesCache[currentInboxIdx % inboxesCache.length];
    currentInboxIdx++;
    return inbox;
  }
  return getSingleAccount();
}

/**
 * Executes a full lead generation & outreach campaign with 3-layer search resiliency.
 */
async function runCampaign(options = {}) {
  const niche = options.niche || config.niche;
  const region = options.region || config.region;
  const maxResults = options.maxResults ? parseInt(options.maxResults, 10) : config.maxResults;
  const isDryRun = options.dryRun !== undefined ? options.dryRun : config.dryRun;
  const onProgress = options.onProgress || (() => {});
  const shouldAbort = options.shouldAbort || (() => false);

  const notify = async (msg) => {
    console.log(msg);
    try {
      await onProgress(msg);
    } catch (e) {}
  };

  await notify(`🚀 *Starting Lead Campaign*\n🎯 *Niche:* ${niche}\n📍 *Region:* ${region}\n📊 *Target:* ${maxResults} emails\n🛡️ *Mode:* ${isDryRun ? 'DRY RUN (Preview)' : '⚡ LIVE (Sending emails)'}`);

  const stats = {
    totalEvaluated: 0,
    alreadyContacted: 0,
    noEmailFound: 0,
    emailsSent: 0,
    errors: 0,
    details: [],
  };

  const STATE_CITY_CLUSTERS = {
    'tennessee': ['Nashville, TN', 'Knoxville, TN', 'Chattanooga, TN', 'Memphis, TN'],
    'tennessy': ['Nashville, TN', 'Knoxville, TN', 'Chattanooga, TN', 'Memphis, TN'],
    'tn': ['Nashville, TN', 'Knoxville, TN', 'Chattanooga, TN', 'Memphis, TN'],
    'texas': ['Austin, TX', 'Dallas, TX', 'Houston, TX', 'San Antonio, TX'],
    'florida': ['Miami, FL', 'Orlando, FL', 'Tampa, FL', 'Jacksonville, FL'],
    'california': ['Los Angeles, CA', 'San Francisco, CA', 'San Diego, CA'],
  };

  const cleanRegKey = (region || '').toLowerCase().replace(/[^a-z]/g, '');
  const matchedClusterKey = Object.keys(STATE_CITY_CLUSTERS).find(k => cleanRegKey.includes(k));
  const searchRegions = matchedClusterKey ? STATE_CITY_CLUSTERS[matchedClusterKey] : [region];

  let places = [];
  const seenPlaceIds = new Set();

  try {
    for (const targetReg of searchRegions) {
      if (places.length >= maxResults * 3) break;

      let regPlaces = [];
      if (config.searchProvider === 'google') {
        regPlaces = await searchPlaces(niche, targetReg, maxResults * 3);
      } else {
        // Layer 1: OpenStreetMap Overpass (with fast multi-mirror fallback)
        regPlaces = await searchPlacesOSM(niche, targetReg, maxResults * 2);

        // Layer 2: Nominatim fallback if Overpass returned 0
        if (!regPlaces || regPlaces.length === 0) {
          regPlaces = await searchNominatim(niche, targetReg, maxResults * 2);
        }

        // Layer 3: Web Search Fallback if both returned 0
        if (!regPlaces || regPlaces.length === 0) {
          regPlaces = await searchWebFallback(niche, targetReg, maxResults * 2);
        }
      }

      if (Array.isArray(regPlaces)) {
        for (const p of regPlaces) {
          const key = p.placeId || p.name;
          if (!seenPlaceIds.has(key)) {
            seenPlaceIds.add(key);
            places.push(p);
          }
        }
      }
    }
  } catch (err) {
    await notify(`❌ Failed to search places: ${err.message}`);
    throw err;
  }

  if (!places || places.length === 0) {
    await notify(`⚠️ No qualifying businesses with websites found in "${region}".`);
    return stats;
  }

  await notify(`📋 Found ${places.length} businesses with active websites. Scanning for contact emails...`);

  for (let i = 0; i < places.length; i++) {
    if (shouldAbort()) {
      await notify('🛑 *Campaign stopped by user.*');
      break;
    }

    if (stats.emailsSent >= maxResults) {
      await notify(`🎯 Reached target goal of ${maxResults} emails sent!`);
      break;
    }

    const biz = places[i];
    stats.totalEvaluated++;

    // Check Place Dedupe
    if (biz.placeId && isPlaceContacted(biz.placeId)) {
      stats.alreadyContacted++;
      continue;
    }

    try {
      const siteInfo = await checkWebsite(biz.website, biz.directEmail);

      if (!siteInfo.live) {
        recordContacted({ placeId: biz.placeId, name: biz.name, status: 'unreachable_site' });
        continue;
      }

      if (!siteInfo.email) {
        recordContacted({ placeId: biz.placeId, name: biz.name, status: 'no_email_found' });
        stats.noEmailFound++;
        continue;
      }

      // Check Email Dedupe
      if (isEmailContacted(siteInfo.email)) {
        stats.alreadyContacted++;
        recordContacted({ placeId: biz.placeId, email: siteInfo.email, name: biz.name, status: 'already_contacted_email' });
        continue;
      }

      if (shouldAbort()) {
        await notify('🛑 *Campaign stopped by user.*');
        break;
      }

      // Found a qualified new lead
      await notify(`✨ *[${stats.emailsSent + 1}/${maxResults}]* Found: *${biz.name}* (\`${siteInfo.email}\`)\n🤖 Generating custom pointers & demo site proposal...`);

      const analysis = await analyzeSite({
        name: biz.name,
        niche,
        region,
        website: biz.website || siteInfo.url,
        siteText: siteInfo.text,
      });

      const chosenInbox = options.inbox || (options.rotateInboxes ? getNextRotatedInbox() : getSingleAccount());

      // Send Email
      const emailResult = await sendEmail({
        to: siteInfo.email,
        subject: analysis.subject,
        body: analysis.body,
        businessName: biz.name,
        fromEmail: chosenInbox?.email,
        fromName: chosenInbox?.fromName,
        appPassword: chosenInbox?.appPassword,
        smtpHost: chosenInbox?.smtpHost,
        smtpPort: chosenInbox?.smtpPort,
        smtpSecure: chosenInbox?.smtpSecure,
      });

      const finalStatus = isDryRun ? 'dry_run_preview' : (emailResult.success ? 'sent' : 'send_error');

      await logResult({
        name: biz.name,
        address: biz.address,
        phone: biz.phone,
        website: biz.website || siteInfo.url,
        status: finalStatus,
        email: siteInfo.email,
        notes: analysis.pointers.join(' | '),
      });

      recordContacted({
        placeId: biz.placeId,
        email: siteInfo.email,
        name: biz.name,
        status: finalStatus,
        pointers: analysis.pointers,
        subject: analysis.subject,
        website: biz.website || siteInfo.url,
        niche,
        region,
        senderEmail: chosenInbox?.email || config.emailUser || config.gmailUser,
      });

      if (emailResult.success) {
        stats.emailsSent++;
        stats.details.push({
          name: biz.name,
          email: siteInfo.email,
          subject: analysis.subject,
        });
        await notify(`✅ Dispatched email to *${biz.name}* (\`${siteInfo.email}\`)\n   ↳ *Sent from:* \`${chosenInbox?.email || config.emailUser || config.gmailUser}\``);

        // Safe pacing delay between email dispatches
        if (!isDryRun && stats.emailsSent < maxResults && config.emailDelayMs > 0) {
          const delaySec = Math.round(config.emailDelayMs / 1000);
          console.log(`   ⏳ Waiting ${delaySec}s before next send to protect domain reputation...`);
          await new Promise((r) => setTimeout(r, config.emailDelayMs));
        }
      } else {
        stats.errors++;
        await notify(`❌ Failed to send to *${biz.name}*: ${emailResult.error}`);
      }

    } catch (err) {
      stats.errors++;
      console.error(`Error processing "${biz.name}":`, err.message);
    }
  }

  const summary = `📊 *Campaign Summary*\n` +
    `• Total Evaluated: ${stats.totalEvaluated}\n` +
    `• Already Contacted (Skipped): ${stats.alreadyContacted}\n` +
    `• No Email Found (Skipped): ${stats.noEmailFound}\n` +
    `• ✉️ *Emails Dispatched:* ${stats.emailsSent}\n` +
    `• Errors: ${stats.errors}`;

  await notify(summary);
  return stats;
}

module.exports = {
  runCampaign,
};
