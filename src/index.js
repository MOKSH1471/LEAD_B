const { config, validateConfig } = require('./config');
const { runCampaign } = require('./pipeline');
const { verifySMTP } = require('./emailSender');
const { startReplyTracker } = require('./replyTracker');
const { getUnrepliedSummary } = require('./tracker');
const { sendTelegramAlert } = require('./notifier');

// Parse CLI flags: --limit=50, --niche="gyms", --region="Miami, FL", --dry-run, --live, --check-only
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    limit: config.maxResults || 50,
    niche: config.niche,
    region: config.region,
    dryRun: config.dryRun,
    checkOnly: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--check-only' || arg === '-c') {
      options.checkOnly = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--live') {
      options.dryRun = false;
    } else if (arg.startsWith('--limit=')) {
      options.limit = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--limit' || arg === '-l') {
      options.limit = parseInt(args[++i], 10);
    } else if (arg.startsWith('--niche=')) {
      options.niche = arg.split('=')[1];
    } else if (arg === '--niche' || arg === '-n') {
      options.niche = args[++i];
    } else if (arg.startsWith('--region=')) {
      options.region = arg.split('=')[1];
    } else if (arg === '--region' || arg === '-r') {
      options.region = args[++i];
    }
  }

  return options;
}

function printDivider() {
  console.log('═'.repeat(68));
}

function printUnrepliedAudit(audit) {
  printDivider();
  console.log('  📬 UNREPLIED MAIL & PIPELINE AUDIT');
  printDivider();
  console.log(`  • Total Contacted Leads:   ${audit.totalContacted}`);
  console.log(`  • ✅ Replied Leads:         ${audit.repliedCount}`);
  console.log(`  • ⏳ Unreplied (Awaiting):  ${audit.unrepliedCount}`);
  console.log(`  • ⚡ Overdue for Follow-up: ${audit.dueCount}`);

  if (audit.unrepliedList.length > 0) {
    console.log('\n  📋 Top Unreplied Prospects (Awaiting Response):');
    const displayList = audit.unrepliedList.slice(0, 10);
    displayList.forEach((lead, idx) => {
      console.log(`    ${idx + 1}. ${lead.name} <${lead.email}>`);
      console.log(`       ↳ Waiting: ${lead.daysWaiting} days | Stage: ${lead.followUpStage} | Status: ${lead.followUpStatus}`);
    });

    if (audit.unrepliedList.length > 10) {
      console.log(`    ... and ${audit.unrepliedList.length - 10} more unreplied leads tracked in database.`);
    }
  } else {
    console.log('  ℹ️ No unreplied leads waiting in the database.');
  }
  printDivider();
}

async function main() {
  const options = parseArgs();

  console.log('\n');
  printDivider();
  console.log('  🎯 LEAD-GEN COLD OUTREACH — SINGLE MAIL RUNNER');
  printDivider();
  console.log(`  📧 Sender Mail:   ${config.emailUser || config.gmailUser || '(Not set in .env)'}`);
  console.log(`  🌐 SMTP Server:   ${config.smtpHost}:${config.smtpPort} (${config.smtpSecure ? 'SSL' : 'STARTTLS'})`);
  console.log(`  📬 IMAP Server:   ${config.imapHost}:${config.imapPort} (Reply Monitor)`);
  console.log(`  🎯 Target Goal:   ${options.limit} emails`);
  console.log(`  🏢 Niche:         ${options.niche}`);
  console.log(`  📍 Region:        ${options.region}`);
  console.log(`  🛡️ Mode:          ${options.dryRun ? 'DRY RUN (Preview Only)' : '⚡ LIVE SEND (Real emails)'}`);
  printDivider();
  console.log('\n');

  validateConfig();

  // 1. Initial Unreplied Mail Audit
  const audit = getUnrepliedSummary();
  printUnrepliedAudit(audit);

  // Send startup Telegram alert
  await sendTelegramAlert(
    `🚀 *Single-Mail Outreach Runner Started*\n\n` +
    `📧 *Sender:* \`${config.emailUser || config.gmailUser}\`\n` +
    `🎯 *Target:* ${options.limit} emails\n` +
    `🏢 *Niche:* ${options.niche} in ${options.region}\n` +
    `🛡️ *Mode:* ${options.dryRun ? 'DRY RUN' : 'LIVE SEND'}\n\n` +
    `📊 *Current Pipeline Status:*\n` +
    `• Total Contacted: ${audit.totalContacted}\n` +
    `• Replied: ${audit.repliedCount}\n` +
    `• ⏳ Unreplied (Awaiting): ${audit.unrepliedCount}\n` +
    `• ⚡ Overdue for follow-up: ${audit.dueCount}`
  );

  // If user passed --check-only, stop here
  if (options.checkOnly) {
    console.log('\n✅ Unreplied mail audit finished (--check-only flag detected). Exiting.');
    return;
  }

  // 2. Verify SMTP connection before starting
  console.log('🔌 Verifying SMTP email credentials...');
  const smtpOk = await verifySMTP({
    email: config.emailUser || config.gmailUser,
    appPassword: config.emailPass || config.gmailAppPassword,
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    dryRun: options.dryRun,
  });

  if (!smtpOk && !options.dryRun) {
    console.error('\n❌ Could not verify connection to your email server.');
    console.error('👉 Please check your EMAIL_USER, EMAIL_PASS, and SMTP settings in your .env file.\n');
    process.exit(1);
  }

  // 3. Start IMAP Real-time Reply Monitor in background
  console.log('\n👂 Starting background IMAP listener for prospect replies...');
  let repliesReceivedDuringRun = 0;

  const replyWatcher = startReplyTracker(async (reply) => {
    repliesReceivedDuringRun++;
    console.log('\n');
    printDivider();
    console.log(`  🚨 [CLIENT REPLY RECEIVED!]`);
    console.log(`  🏢 Business:  ${reply.businessName}`);
    console.log(`  📧 From:      ${reply.fromEmail}`);
    console.log(`  📝 Subject:   ${reply.subject}`);
    console.log(`  ⏰ Received:  ${reply.date}`);
    console.log(`  💬 Snippet:   "${reply.snippet}"`);
    printDivider();
    console.log('\n');

    await sendTelegramAlert(
      `🚨 *NEW CLIENT RESPONSE RECEIVED!*\n\n` +
      `🏢 *Business:* *${reply.businessName}*\n` +
      `📧 *From:* \`${reply.fromEmail}\`\n` +
      `📝 *Subject:* \`${reply.subject}\`\n` +
      `⏰ *Time:* _${reply.date}_\n\n` +
      `💬 *Message:* \n"${reply.snippet}"\n\n` +
      `🛑 *Automated follow-ups for this lead have been automatically HALTED.*`
    );
  }, {
    singleAccount: true,
    pollIntervalMs: 25000, // Check every 25 seconds during the campaign
  });

  // 4. Run the campaign (strictly using the single email account)
  try {
    const stats = await runCampaign({
      niche: options.niche,
      region: options.region,
      maxResults: options.limit,
      dryRun: options.dryRun,
      rotateInboxes: false, // Enforce single mail account
    });

    // 5. Final check for any late replies and stop reply tracker
    console.log('\n🔍 Running final inbox sync check for any new replies...');
    try {
      await replyWatcher.checkNow();
    } catch (e) {}

    replyWatcher.stop();

    // 6. Final Unreplied Mail Audit
    const finalAudit = getUnrepliedSummary();

    console.log('\n');
    printDivider();
    console.log('  🏁 RUN COMPLETED SUCCESSFULLY');
    printDivider();
    console.log(`  • ✉️ Emails Sent in This Batch: ${stats.emailsSent} / ${options.limit}`);
    console.log(`  • 🚨 New Replies Detected:      ${repliesReceivedDuringRun}`);
    console.log(`  • ⏳ Total Unreplied Prospects:  ${finalAudit.unrepliedCount}`);
    console.log(`  • ⚡ Overdue for Follow-up:     ${finalAudit.dueCount}`);
    printDivider();
    console.log('\n');

    await sendTelegramAlert(
      `🏁 *Single-Mail Campaign Finished!*\n\n` +
      `✉️ *Emails Dispatched:* ${stats.emailsSent} / ${options.limit}\n` +
      `🚨 *Replies Detected During Run:* ${repliesReceivedDuringRun}\n` +
      `⏳ *Total Unreplied Leads Awaiting Response:* ${finalAudit.unrepliedCount}\n` +
      `⚡ *Overdue for Follow-up:* ${finalAudit.dueCount}\n\n` +
      `_Bot has completed its run and stopped._`
    );

  } catch (err) {
    replyWatcher.stop();
    console.error('\n❌ Error during campaign execution:', err.message);
    await sendTelegramAlert(`❌ *Campaign Error:* ${err.message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
