const nodemailer = require('nodemailer');
const { config } = require('./config');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const transporters = new Map();

function getTransporter(email = config.gmailUser, appPassword = config.gmailAppPassword) {
  if (!email || !appPassword) return null;
  const key = `${email}:${appPassword}`;
  if (!transporters.has(key)) {
    transporters.set(key, nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,          // STARTTLS — works on Render, Railway, and all cloud platforms
      secure: false,      // false = STARTTLS upgrade after connection (NOT plain text)
      requireTLS: true,   // Enforces TLS upgrade; rejects plaintext connections
      auth: {
        user: email,
        pass: appPassword,
      },
      connectionTimeout: 20000,
      greetingTimeout: 20000,
      socketTimeout: 30000,
    }));
  }
  return transporters.get(key);
}

/**
 * Verifies SMTP connectivity at startup. Logs a clear warning if unreachable.
 */
async function verifySMTP(email = config.gmailUser, appPassword = config.gmailAppPassword) {
  if (config.dryRun) return true; // Skip SMTP check in dry-run mode
  const client = getTransporter(email, appPassword);
  if (!client) return false;
  try {
    await client.verify();
    console.log(`✅ [SMTP] Gmail connection verified for ${email} (port 587 STARTTLS).`);
    return true;
  } catch (err) {
    console.error(`❌ [SMTP] Gmail connection FAILED for ${email}: ${err.message}`);
    return false;
  }
}

/**
 * Sends or simulates sending an outreach email via Gmail SMTP.
 * Supports multi-inbox credentials: fromEmail, fromName, appPassword
 */
async function sendEmail({ to, subject, body, businessName, fromEmail, fromName, appPassword }) {
  if (!to) {
    return { success: false, error: 'Missing recipient email' };
  }

  const senderEmail = fromEmail || config.gmailUser;
  const senderName = fromName || config.fromName || 'Outreach';
  const senderPass = appPassword || config.gmailAppPassword;

  // DRY RUN HANDLING
  if (config.dryRun) {
    console.log(`\n📨 [DRY RUN — EMAIL PREVIEW]`);
    console.log(`   To:       ${to} (${businessName || 'Business'})`);
    console.log(`   From:     "${senderName}" <${senderEmail || 'operator@gmail.com'}>`);
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
  const client = getTransporter(senderEmail, senderPass);
  if (!client) {
    throw new Error(`Credentials missing for sender ${senderEmail} in live sending.`);
  }

  try {
    const info = await client.sendMail({
      from: `"${senderName}" <${senderEmail}>`,
      to,
      subject,
      text: body,
    });

    console.log(`   ✅ Live email dispatched from ${senderEmail} to ${to} (Message ID: ${info.messageId})`);

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
  verifySMTP,
};
