const axios = require('axios');
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
 * Dispatches an email via Resend HTTP API (recommended for cloud) or fallback Gmail SMTP.
 */
async function sendEmail({ to, subject, body, businessName }) {
  if (!to) {
    return { success: false, error: 'Missing recipient email' };
  }

  // DRY RUN HANDLING
  if (config.dryRun) {
    console.log(`\n📨 [DRY RUN — EMAIL PREVIEW]`);
    console.log(`   To:       ${to} (${businessName || 'Business'})`);
    console.log(`   From:     "${config.fromName}" <${config.resendFrom || config.gmailUser || 'operator@gmail.com'}>`);
    console.log(`   Subject:  ${subject}`);
    console.log(`   --- Body ---`);
    console.log(body.split('\n').map(l => `   | ${l}`).join('\n'));
    console.log(`   -------------\n`);

    return {
      success: true,
      dryRun: true,
    };
  }

  // METHOD 1: RESEND HTTP API (Bypasses all cloud SMTP port restrictions on Render)
  if (config.resendApiKey) {
    try {
      const fromAddress = config.resendFrom || 'onboarding@resend.dev';
      const fromHeader = `"${config.fromName}" <${fromAddress}>`;

      const payload = {
        from: fromHeader,
        to: [to],
        subject,
        text: body,
      };

      // Set reply_to so prospect responses go directly to Gmail and trigger Telegram alerts
      if (config.gmailUser) {
        payload.reply_to = config.gmailUser;
      }

      const resendResp = await axios.post('https://api.resend.com/emails', payload, {
        headers: {
          'Authorization': `Bearer ${config.resendApiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      });

      const messageId = resendResp.data && resendResp.data.id ? resendResp.data.id : 'resend_ok';
      console.log(`   ✅ Live email dispatched via Resend to ${to} (ID: ${messageId})`);

      if (config.emailDelayMs > 0) {
        console.log(`   ⏳ Enforcing delay of ${config.emailDelayMs / 1000}s before next send...`);
        await sleep(config.emailDelayMs);
      }

      return {
        success: true,
        dryRun: false,
        messageId,
      };
    } catch (resendErr) {
      const errMsg = (resendErr.response && resendErr.response.data && resendErr.response.data.message)
        ? resendErr.response.data.message
        : resendErr.message;
      console.error(`   ❌ Resend dispatch failed for ${to}:`, errMsg);
      return {
        success: false,
        error: errMsg,
      };
    }
  }

  // METHOD 2: GMAIL SMTP FALLBACK (For local laptop execution)
  const client = getTransporter();
  if (!client) {
    throw new Error('Neither RESEND_API_KEY nor GMAIL credentials are configured in .env.');
  }

  try {
    const info = await client.sendMail({
      from: `"${config.fromName}" <${config.gmailUser}>`,
      to,
      subject,
      text: body,
    });

    console.log(`   ✅ Live email dispatched via Gmail SMTP to ${to} (Message ID: ${info.messageId})`);

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
    console.error(`   ❌ Failed to send email via Gmail SMTP to ${to}:`, err.message);
    return {
      success: false,
      error: err.message,
    };
  }
}

module.exports = {
  sendEmail,
};
