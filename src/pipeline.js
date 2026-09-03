const { config } = require('./config');
const { searchPlaces } = require('./placesSearch');
const { searchPlacesOSM } = require('./osmSearch');
const { checkWebsite } = require('./websiteCheck');
const { analyzeSite } = require('./analyzer');
const { sendEmail } = require('./emailSender');
const { isPlaceContacted, isEmailContacted, recordContacted, logResult } = require('./tracker');

/**
 * Executes a full lead generation & outreach campaign.
 * Accepts options to override niche, region, maxResults, and dryRun.
 * @param {Object} options
 * @param {string} options.niche
 * @param {string} options.region
 * @param {number} options.maxResults
 * @param {boolean} options.dryRun
 * @param {Function} [options.onProgress] Optional callback for live UI / Telegram updates
 * @returns {Promise<Object>} Summary stats
 */
async function runCampaign(options = {}) {
  const niche = options.niche || config.niche;
  const region = options.region || config.region;
  const maxResults = options.maxResults ? parseInt(options.maxResults, 10) : config.maxResults;
  const isDryRun = options.dryRun !== undefined ? options.dryRun : config.dryRun;
  const onProgress = options.onProgress || (() => {});

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

  let places = [];
  try {
    if (config.searchProvider === 'google') {
      places = await searchPlaces(niche, region, maxResults * 3);
    } else {
      places = await searchPlacesOSM(niche, region, maxResults * 4);
    }
  } catch (err) {
    await notify(`❌ Failed to search places: ${err.message}`);
    throw err;
  }

  if (places.length === 0) {
    await notify(`⚠️ No qualifying businesses with websites found in "${region}".`);
    return stats;
  }

  await notify(`📋 Found ${places.length} businesses with active websites. Scanning for contact emails...`);

  for (let i = 0; i < places.length; i++) {
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

      // Found a qualified new lead
      await notify(`✨ *[${stats.emailsSent + 1}/${maxResults}]* Found: *${biz.name}* (\`${siteInfo.email}\`)\n🤖 Generating custom pointers & demo site proposal...`);

      const analysis = await analyzeSite({
        name: biz.name,
        niche,
        region,
        website: biz.website || siteInfo.url,
        siteText: siteInfo.text,
      });

      // Send Email
      const emailResult = await sendEmail({
        to: siteInfo.email,
        subject: analysis.subject,
        body: analysis.body,
        businessName: biz.name,
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
      });

      if (emailResult.success) {
        stats.emailsSent++;
        stats.details.push({
          name: biz.name,
          email: siteInfo.email,
          subject: analysis.subject,
        });
        await notify(`✅ Dispatched email to *${biz.name}* (\`${siteInfo.email}\`)`);
      } else {
        stats.errors++;
        await notify(`❌ Failed to send to *${biz.name}*: ${emailResult.error}`);
      }

    } catch (err) {
      stats.errors++;
      console.error(`Error processing "${biz.name}":`, err.message);
    }
  }

  const summary = `📊 *Campaign Finished!*\n` +
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
