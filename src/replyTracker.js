const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const { config } = require('./config');
const { markLeadReplied } = require('./tracker');
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

function getInboxesToMonitor(options = {}) {
  if (options.inbox) {
    return [options.inbox];
  }
  if (options.singleAccount) {
    const user = config.emailUser || config.gmailUser;
    const pass = config.emailPass || config.gmailAppPassword;
    if (user && pass) {
      return [{
        email: user,
        appPassword: pass,
        imapHost: config.imapHost,
        imapPort: config.imapPort,
        imapSecure: config.imapSecure,
      }];
    }
  }

  const inboxesPath = path.resolve(process.cwd(), 'config/inboxes.json');
  if (fs.existsSync(inboxesPath)) {
    try {
      const list = JSON.parse(fs.readFileSync(inboxesPath, 'utf8'));
      if (Array.isArray(list) && list.length > 0) {
        return list;
      }
    } catch (e) {}
  }
  if ((config.emailUser || config.gmailUser) && (config.emailPass || config.gmailAppPassword)) {
    return [{
      email: config.emailUser || config.gmailUser,
      appPassword: config.emailPass || config.gmailAppPassword,
      imapHost: config.imapHost,
      imapPort: config.imapPort,
      imapSecure: config.imapSecure,
    }];
  }
  return [];
}

/**
 * Starts the IMAP background polling worker for incoming prospect replies.
 * Uses fresh client connection per check cycle for maximum reliability.
 */
function startReplyTracker(onNewReply, options = {}) {
  const inboxes = getInboxesToMonitor(options);
  if (inboxes.length === 0) {
    console.log('ℹ️ Reply tracker not started: No valid email account found for IMAP.');
    return { checkNow: async () => {}, stop: () => {} };
  }

  loadNotified();

  const pollIntervalMs = options.pollIntervalMs || 30000; // Poll every 30 seconds by default during runs

  async function checkInbox() {
    const contactedEmails = getContactedMap();
    const emailKeys = Object.keys(contactedEmails);
    if (emailKeys.length === 0) return;

    const monitoredInboxes = getInboxesToMonitor(options);
    for (const inbox of monitoredInboxes) {
      if (!inbox.email || !inbox.appPassword) continue;

      const imapHost = inbox.imapHost || config.imapHost || 'imap.titan.email';
      const imapPort = inbox.imapPort || config.imapPort || 993;
      const imapSecure = inbox.imapSecure !== undefined ? inbox.imapSecure : config.imapSecure;

      const client = new ImapFlow({
        host: imapHost,
        port: imapPort,
        secure: imapSecure,
        auth: {
          user: inbox.email,
          pass: inbox.appPassword,
        },
        logger: false,
        tls: {
          rejectUnauthorized: false,
        },
      });

      try {
        await client.connect();
        const lock = await client.getMailboxLock('INBOX');

        try {
          const status = await client.status('INBOX', { messages: true });
          const totalMessages = status.messages || 0;
          if (totalMessages === 0) {
            lock.release();
            await client.logout();
            continue;
          }

          // Fetch only recent 50 messages to keep check fast
          const startSeq = Math.max(1, totalMessages - 50);
          const messages = client.fetch(`${startSeq}:*`, { envelope: true, source: true });

          for await (const msg of messages) {
            const rawUid = String(msg.uid);
            const uid = `${inbox.email}_${rawUid}`;
            if (notifiedSet.has(uid) || notifiedSet.has(rawUid)) continue;

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

              // Immediately mark lead as replied so all future follow-ups are halted!
              try {
                markLeadReplied(matchedKey || fromAddress, replyData);
              } catch (trackerErr) {
                console.warn('Could not update tracker for reply:', trackerErr.message);
              }

              console.log(`\n🚨 [LEAD REPLY] New reply from "${replyData.businessName}" (${replyData.fromEmail})!`);

              if (typeof onNewReply === 'function') {
                try {
                  onNewReply(replyData);
                } catch (e) {}
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
        // Normal transient error / disconnect ignore
      }
    }
  }

  // Initial check quickly after 2 seconds
  const initialTimer = setTimeout(checkInbox, 2000);

  // Poll inbox regularly
  const intervalId = setInterval(checkInbox, pollIntervalMs);

  return {
    checkNow: checkInbox,
    stop: () => {
      clearTimeout(initialTimer);
      clearInterval(intervalId);
    },
  };
}

module.exports = {
  startReplyTracker,
  getAllReplies,
};
