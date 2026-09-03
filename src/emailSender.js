const nodemailer = require('nodemailer');
const { config } = require('./config');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let transporter = null;

function getTransporter() {
  if (!transporter && config.gmailUser && config.gmailAppPassword) {
    transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: config.gmailUser,
        pass: config.gmailAppPassword,
      },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
    });
  }
  return transporter;
}

/**
 * Sends or simulates sending an outreach email via Gmail SMTP.
 */
async function sendEmail({ to, subject, body, businessName }) {
  if (!to) {
    return { success: false, error: 'Missing recipient email' };
  }

  // DRY RUN HANDLING
  if (config.dryRun) {
    console.log(`\n📨 [DRY RUN — EMAIL PREVIEW]`);
    console.log(`   To:       ${to} (${businessName || 'Business'})`);
    console.log(`   From:     "${config.fromName}" <${config.gmailUser || 'operator@gmail.com'}>`);
    console.log(`   Subject:  ${subject}`);
    console.log(`   --- Body ---`);
    console.log(body.split('\n').map(l => `   | ${l}`).join('\n'));
    console.log(`   -------------\n`);

    return {
      success: true,
      dryRun: true,
    };
  }

  // LIVE SEND VIA GMAIL SMTP
  const client = getTransporter();
  if (!client) {
    throw new Error('GMAIL_USER or GMAIL_APP_PASSWORD is missing in .env for live sending.');
  }

  try {
    const info = await client.sendMail({
      from: `"${config.fromName}" <${config.gmailUser}>`,
      to,
      subject,
      text: body,
    });

    console.log(`   ✅ Live email dispatched to ${to} (Message ID: ${info.messageId})`);

    // Respect delay between sends to protect sender reputation
    if (config.emailDelayMs > 0) {
      console.log(`   ⏳ Enforcing delay of ${config.emailDelayMs / 1000}s before next send...`);
      await sleep(config.emailDelayMs);
    }

    return {
      success: true,
      dryRun: false,
      messageId: info.messageId,
    };
  } catch (err) {
    console.error(`   ❌ Failed to send email to ${to}:`, err.message);
    return {
      success: false,
      error: err.message,
    };
  }
}

module.exports = {
  sendEmail,
};
