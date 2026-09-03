const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const { config } = require('./config');
const fs = require('fs');
const path = require('path');

const REPLIES_FILE = path.resolve(process.cwd(), 'replies.json');
const NOTIFIED_FILE = path.resolve(process.cwd(), 'notified_replies.json');
const CONTACTED_FILE = path.resolve(process.cwd(), 'contacted.json');

let notifiedSet = new Set();
function loadNotified() {
  try {
    if (fs.existsSync(NOTIFIED_FILE)) {
      const list = JSON.parse(fs.readFileSync(NOTIFIED_FILE, 'utf-8'));
      notifiedSet = new Set(list);
    }
  } catch (e) {}
}

function saveNotified() {
  try {
    fs.writeFileSync(NOTIFIED_FILE, JSON.stringify(Array.from(notifiedSet), null, 2), 'utf-8');
  } catch (e) {}
}

function saveReply(replyObj) {
  let allReplies = [];
  try {
    if (fs.existsSync(REPLIES_FILE)) {
      allReplies = JSON.parse(fs.readFileSync(REPLIES_FILE, 'utf-8'));
    }
  } catch (e) {}
  allReplies.push(replyObj);
  try {
    fs.writeFileSync(REPLIES_FILE, JSON.stringify(allReplies, null, 2), 'utf-8');
  } catch (e) {}
}

function getContactedMap() {
  try {
    if (fs.existsSync(CONTACTED_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONTACTED_FILE, 'utf-8'));
      return data.emails || {};
    }
  } catch (e) {}
  return {};
}

function getAllReplies() {
  try {
    if (fs.existsSync(REPLIES_FILE)) {
      return JSON.parse(fs.readFileSync(REPLIES_FILE, 'utf-8'));
    }
  } catch (e) {}
  return [];
}

/**
 * Starts the IMAP background polling worker for incoming prospect replies.
 * Uses fresh client connection per check cycle for maximum reliability.
 */
function startReplyTracker(onNewReply) {
  if (!config.gmailUser || !config.gmailAppPassword) {
    console.log('ℹ️ Reply tracker not started: GMAIL_USER or GMAIL_APP_PASSWORD missing.');
    return;
  }

  loadNotified();

  async function checkInbox() {
    const contactedEmails = getContactedMap();
    const emailKeys = Object.keys(contactedEmails);
    if (emailKeys.length === 0) return;

    const client = new ImapFlow({
      host: 'imap.gmail.com',
      port: 993,
      secure: true,
      auth: {
        user: config.gmailUser,
        pass: config.gmailAppPassword,
      },
      logger: false,
    });

    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');

      try {
        const messages = client.fetch({ seq: '1:*' }, { envelope: true, source: true });

        for await (const msg of messages) {
          const uid = String(msg.uid);
          if (notifiedSet.has(uid)) continue;

          const fromAddress = (msg.envelope.from && msg.envelope.from[0] ? msg.envelope.from[0].address : '').toLowerCase().trim();

          if (fromAddress && (contactedEmails[fromAddress] || emailKeys.some(k => fromAddress.includes(k)))) {
            const matchedKey = contactedEmails[fromAddress] ? fromAddress : emailKeys.find(k => fromAddress.includes(k));
            const businessInfo = contactedEmails[matchedKey] || { name: 'Prospect' };

            let bodyText = '';
            try {
              const parsed = await simpleParser(msg.source);
              bodyText = parsed.text || parsed.html || '';
            } catch (e) {
              bodyText = msg.envelope.subject || '';
            }

            const cleanSnippet = bodyText.replace(/\s+/g, ' ').trim().slice(0, 300);

            const replyData = {
              uid,
              businessName: businessInfo.name || 'Prospect',
              fromEmail: fromAddress,
              subject: msg.envelope.subject || 'No Subject',
              snippet: cleanSnippet || '(Empty message)',
              date: msg.envelope.date ? new Date(msg.envelope.date).toLocaleString() : new Date().toLocaleString(),
            };

            notifiedSet.add(uid);
            saveNotified();
            saveReply(replyData);

            console.log(`\n🚨 [LEAD REPLY] New reply from "${replyData.businessName}" (${replyData.fromEmail})!`);

            if (typeof onNewReply === 'function') {
              onNewReply(replyData);
            }
          } else {
            notifiedSet.add(uid);
          }
        }
      } finally {
        lock.release();
      }
      await client.logout();
    } catch (err) {
      // Ignore normal disconnects
    }
  }

  // Initial check after 5 seconds
  setTimeout(checkInbox, 5000);

  // Poll inbox every 90 seconds
  const intervalId = setInterval(checkInbox, 90000);

  return {
    checkNow: checkInbox,
    stop: () => clearInterval(intervalId),
  };
}

module.exports = {
  startReplyTracker,
  getAllReplies,
};
