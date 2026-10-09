const nodemailer = require('nodemailer');
const { config } = require('./config');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const transporters = new Map();

function getTransporter(options = {}) {
  // Support both legacy signature getTransporter(email, pass) and getTransporter({ email, ... })
  let email, appPassword, host, port, secure;
  if (typeof options === 'string') {
    email = options;
    appPassword = arguments[1] || config.emailPass || config.gmailAppPassword;
    host = config.smtpHost;
    port = config.smtpPort;
    secure = config.smtpSecure;
  } else {
    email = options.email || config.emailUser || config.gmailUser;
    appPassword = options.appPassword || options.password || config.emailPass || config.gmailAppPassword;
    host = options.smtpHost || options.host || config.smtpHost;
    port = options.smtpPort || options.port || config.smtpPort;
    secure = options.smtpSecure !== undefined ? options.smtpSecure : (options.secure !== undefined ? options.secure : config.smtpSecure);
  }

  if (!email || !appPassword) return null;

  const isPort465 = Number(port) === 465 || secure === true;
  const key = `${email}:${host}:${port}:${isPort465}`;
  if (!transporters.has(key)) {
    transporters.set(key, nodemailer.createTransport({
      host: host || 'smtp.titan.email',
      port: Number(port) || (isPort465 ? 465 : 587),
      secure: isPort465,
      auth: {
        user: email,
        pass: appPassword,
      },
      tls: {
        rejectUnauthorized: false,
      },
      connectionTimeout: 45000,
      greetingTimeout: 45000,
      socketTimeout: 45000,
    }));
  }
  return transporters.get(key);
}

/**
 * Verifies SMTP connectivity at startup. Logs a clear warning if unreachable.
 */
async function verifySMTP(options = {}) {
  const isDryRun = options.dryRun !== undefined ? options.dryRun : config.dryRun;
  if (isDryRun) return true; // Skip SMTP check in dry-run mode
  const client = getTransporter(options);
  const email = (typeof options === 'object' ? options.email : options) || config.emailUser || config.gmailUser;
  const host = (typeof options === 'object' ? options.host : null) || config.smtpHost;
  const port = (typeof options === 'object' ? options.port : null) || config.smtpPort;

  if (!client) {
    console.error(`❌ [SMTP] Credentials missing for ${email || 'account'}`);
    return false;
  }
  try {
    await client.verify();
    console.log(`✅ [SMTP] Email server connection verified for ${email} (${host}:${port}).`);
    return true;
  } catch (err) {
    console.error(`❌ [SMTP] Email connection FAILED for ${email} (${host}:${port}): ${err.message}`);
    return false;
  }
}

const { ImapFlow } = require('imapflow');

async function syncToSentFolder({ fromName, senderEmail, senderPass, to, subject, body, imapHost, imapPort, imapSecure }) {
  if (!senderEmail || !senderPass) return;
  // Gmail automatically saves SMTP sends to Sent on their backend; other providers like GoDaddy require IMAP append
  if (senderEmail.toLowerCase().endsWith('@gmail.com')) return;

  try {
    const client = new ImapFlow({
      host: imapHost || config.imapHost || 'imap.secureserver.net',
      port: imapPort || config.imapPort || 993,
      secure: imapSecure !== undefined ? imapSecure : true,
      auth: {
        user: senderEmail,
        pass: senderPass,
      },
      logger: false,
      tls: { rejectUnauthorized: false },
    });

    await client.connect();

    const fromHeader = fromName ? `"${fromName.replace(/"/g, '')}" <${senderEmail}>` : senderEmail;
    const rawMessage = Buffer.from(
      `From: ${fromHeader}\r\n` +
      `To: ${to}\r\n` +
      `Subject: ${subject}\r\n` +
      `Date: ${new Date().toUTCString()}\r\n` +
      `MIME-Version: 1.0\r\n` +
      `Content-Type: text/plain; charset=utf-8\r\n\r\n` +
      body
    );

    await client.append('Sent', rawMessage, ['\\Seen']);
    await client.logout();
  } catch (err) {
    // Non-blocking warning
  }
}

/**
 * Sends or simulates sending an outreach email via SMTP (GoDaddy / Titan / Custom Domain / Gmail).
 */
async function sendEmail({ to, subject, body, businessName, fromEmail, fromName, appPassword, smtpHost, smtpPort, smtpSecure }) {
  if (!to) {
    return { success: false, error: 'Missing recipient email' };
  }

  const senderEmail = fromEmail || config.emailUser || config.gmailUser;
  const senderName = fromName || config.fromName || 'Outreach';
  const senderPass = appPassword || config.emailPass || config.gmailAppPassword;

  // DRY RUN HANDLING
  if (config.dryRun) {
    console.log(`\n📨 [DRY RUN — EMAIL PREVIEW]`);
    console.log(`   To:       ${to} (${businessName || 'Business'})`);
    console.log(`   From:     "${senderName}" <${senderEmail || 'operator@domain.com'}>`);
    console.log(`   Subject:  ${subject}`);
    console.log(`   --- Body ---`);
    console.log(body.split('\n').map(l => `   | ${l}`).join('\n'));
    console.log(`   -------------\n`);

    return {
      success: true,
      dryRun: true,
    };
  }

  // LIVE SEND VIA SMTP
  const client = getTransporter({
    email: senderEmail,
    appPassword: senderPass,
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
  });

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

    // Automatically sync copy to IMAP Sent folder so it appears in webmail Sent folder
    syncToSentFolder({
      fromName: senderName,
      senderEmail,
      senderPass,
      to,
      subject,
      body,
      imapHost: config.imapHost,
      imapPort: config.imapPort,
      imapSecure: config.imapSecure,
    }).catch(() => {});

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
  syncToSentFolder,
};
