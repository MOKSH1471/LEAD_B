const fs = require('fs');
const path = require('path');

const { config } = require('./config');

const CONTACTED_FILE = path.resolve(process.cwd(), 'contacted.json');
const RESULTS_CSV = path.resolve(process.cwd(), 'results.csv');
const REPLIES_FILE = path.resolve(process.cwd(), 'replies.json');

// Structure of contacted.json: { placeIds: { [id]: {...} }, emails: { [email]: {...} } }
let contactedData = { placeIds: {}, emails: {} };

function loadContacted() {
  try {
    if (fs.existsSync(CONTACTED_FILE)) {
      const raw = fs.readFileSync(CONTACTED_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed.placeIds || parsed.emails) {
        contactedData = {
          placeIds: parsed.placeIds || {},
          emails: parsed.emails || {},
        };
      } else {
        // Migrate flat legacy format
        contactedData = {
          placeIds: parsed || {},
          emails: {},
        };
        // Populate emails from legacy entries
        Object.values(parsed).forEach(entry => {
          if (entry.email) {
            contactedData.emails[entry.email.toLowerCase()] = entry;
          }
        });
      }
    } else {
      saveContacted();
    }
  } catch (err) {
    contactedData = { placeIds: {}, emails: {} };
  }
}

function saveContacted() {
  try {
    fs.writeFileSync(CONTACTED_FILE, JSON.stringify(contactedData, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Tracker] Error writing contacted.json:', err.message);
  }
}

loadContacted();

function isPlaceContacted(placeId) {
  if (!placeId) return false;
  return Boolean(contactedData.placeIds[placeId]);
}

function isEmailContacted(email) {
  if (!email) return false;
  const cleanEmail = email.toLowerCase().trim();
  return Boolean(contactedData.emails[cleanEmail]);
}

function recordContacted({ placeId, email, name, status, pointers, subject, website, niche, region }) {
  const timestamp = new Date().toISOString();
  const cleanEmail = email ? email.toLowerCase().trim() : '';

  const entry = {
    name: name || 'Prospect',
    email: cleanEmail,
    website: website || '',
    niche: niche || config.niche,
    region: region || config.region,
    subject: subject || `Quick note on ${name || 'your'} website`,
    status,
    pointers: pointers || [],
    contactedAt: timestamp,
    lastContactedAt: timestamp,
    followUpStage: 0,
    hasReplied: false,
    placeId: placeId || '',
  };

  if (placeId) {
    contactedData.placeIds[placeId] = entry;
  }
  if (cleanEmail) {
    contactedData.emails[cleanEmail] = entry;
  }

  saveContacted();
}

function markLeadReplied(email, replyData = {}) {
  if (!email) return;
  const cleanEmail = email.toLowerCase().trim();
  let updated = false;

  const updateEntry = (entry) => {
    entry.hasReplied = true;
    entry.repliedAt = new Date().toISOString();
    if (replyData.subject) entry.replySubject = replyData.subject;
    if (replyData.snippet) entry.replySnippet = replyData.snippet;
    updated = true;
  };

  if (contactedData.emails[cleanEmail]) {
    updateEntry(contactedData.emails[cleanEmail]);
  }

  // Also check if any placeId references this email
  Object.values(contactedData.placeIds).forEach(entry => {
    if (entry.email && entry.email.toLowerCase().trim() === cleanEmail) {
      updateEntry(entry);
    }
  });

  if (updated) {
    saveContacted();
  }
}

function getRepliedEmailsSet() {
  const set = new Set();
  try {
    if (fs.existsSync(REPLIES_FILE)) {
      const replies = JSON.parse(fs.readFileSync(REPLIES_FILE, 'utf-8'));
      replies.forEach(r => {
        if (r.fromEmail) set.add(r.fromEmail.toLowerCase().trim());
      });
    }
  } catch (e) {}
  return set;
}

function getLeadsDueForFollowUp(options = {}) {
  const force = options.force === true;
  loadContacted();
  const repliedSet = getRepliedEmailsSet();
  const dueLeads = [];
  const now = Date.now();

  const maxFollowUps = config.maxFollowUps || 2;
  const delay1Ms = (config.followUpDelayDays || 3) * 24 * 60 * 60 * 1000;
  const delay2Ms = (config.followUpFinalDelayDays || 4) * 24 * 60 * 60 * 1000;

  for (const [emailKey, lead] of Object.entries(contactedData.emails)) {
    const cleanEmail = emailKey.toLowerCase().trim();

    // Skip if already replied
    if (lead.hasReplied || repliedSet.has(cleanEmail)) {
      continue;
    }

    // Only follow up with successfully sent or dry-run previewed leads
    if (lead.status !== 'sent' && lead.status !== 'dry_run_preview') {
      continue;
    }

    const currentStage = lead.followUpStage !== undefined ? lead.followUpStage : 0;
    if (currentStage >= maxFollowUps) {
      continue;
    }

    const lastTime = new Date(lead.lastContactedAt || lead.contactedAt || 0).getTime();
    if (!lastTime || isNaN(lastTime)) continue;

    const elapsedMs = now - lastTime;
    const elapsedDays = (elapsedMs / (1000 * 60 * 60 * 24)).toFixed(1);

    if (currentStage === 0 && (force || elapsedMs >= delay1Ms)) {
      dueLeads.push({
        ...lead,
        email: cleanEmail,
        targetStage: 1,
        elapsedDays,
        forced: force && elapsedMs < delay1Ms,
      });
    } else if (currentStage === 1 && (force || elapsedMs >= delay2Ms)) {
      dueLeads.push({
        ...lead,
        email: cleanEmail,
        targetStage: 2,
        elapsedDays,
        forced: force && elapsedMs < delay2Ms,
      });
    }
  }

  return dueLeads;
}

function getFollowUpQueueStats() {
  loadContacted();
  const repliedSet = getRepliedEmailsSet();
  const now = Date.now();

  let stage0Waiting = 0;
  let stage1Waiting = 0;
  let stage2Completed = 0;
  let totalReplied = 0;
  let dueNow = 0;

  const delay1Ms = (config.followUpDelayDays || 3) * 24 * 60 * 60 * 1000;
  const delay2Ms = (config.followUpFinalDelayDays || 4) * 24 * 60 * 60 * 1000;

  for (const [emailKey, lead] of Object.entries(contactedData.emails)) {
    const cleanEmail = emailKey.toLowerCase().trim();
    if (lead.hasReplied || repliedSet.has(cleanEmail)) {
      totalReplied++;
      continue;
    }

    if (lead.status !== 'sent' && lead.status !== 'dry_run_preview') {
      continue;
    }

    const stage = lead.followUpStage !== undefined ? lead.followUpStage : 0;
    const lastTime = new Date(lead.lastContactedAt || lead.contactedAt || 0).getTime();
    const elapsedMs = now - lastTime;

    if (stage === 0) {
      if (elapsedMs >= delay1Ms) dueNow++;
      else stage0Waiting++;
    } else if (stage === 1) {
      if (elapsedMs >= delay2Ms) dueNow++;
      else stage1Waiting++;
    } else {
      stage2Completed++;
    }
  }

  return {
    dueNow,
    stage0Waiting,
    stage1Waiting,
    stage2Completed,
    totalReplied,
    totalTracked: Object.keys(contactedData.emails).length,
  };
}

function recordFollowUpSent(email, stage, status, subject) {
  if (!email) return;
  const cleanEmail = email.toLowerCase().trim();
  const timestamp = new Date().toISOString();

  const updateLead = (lead) => {
    lead.followUpStage = stage;
    lead.lastContactedAt = timestamp;
    lead.lastFollowUpStatus = status;
    lead.lastFollowUpSubject = subject;
  };

  if (contactedData.emails[cleanEmail]) {
    updateLead(contactedData.emails[cleanEmail]);
  }

  Object.values(contactedData.placeIds).forEach(entry => {
    if (entry.email && entry.email.toLowerCase().trim() === cleanEmail) {
      updateLead(entry);
    }
  });

  saveContacted();

  logResult({
    name: (contactedData.emails[cleanEmail] && contactedData.emails[cleanEmail].name) || 'Prospect',
    email: cleanEmail,
    status: `followup_${stage}_${status}`,
    notes: `Automated Follow-up Stage ${stage} (${status})`,
  });
}

function escapeCsv(field) {
  if (field === null || field === undefined) return '""';
  const str = String(field).replace(/"/g, '""');
  return `"${str}"`;
}

function appendToCsv(filePath, headerLine, rowArray) {
  const rowLine = rowArray.map(escapeCsv).join(',') + '\n';
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, headerLine + '\n' + rowLine, 'utf-8');
    } else {
      fs.appendFileSync(filePath, rowLine, 'utf-8');
    }
  } catch (err) {
    if (err.code === 'EBUSY' || err.code === 'EPERM') {
      console.warn(`   ⚠️ Could not write to ${path.basename(filePath)} (file is open in another app).`);
    } else {
      console.warn(`   ⚠️ CSV write note: ${err.message}`);
    }
  }
}

async function logResult(row) {
  const header = 'Business Name,Address,Phone,Website,Status,Email Used,Notes / Pointers,Timestamp';
  const data = [
    row.name || 'Unknown',
    row.address || '',
    row.phone || '',
    row.website || '',
    row.status || 'processed',
    row.email || '',
    row.notes || '',
    new Date().toISOString(),
  ];
  appendToCsv(RESULTS_CSV, header, data);
}

module.exports = {
  isPlaceContacted,
  isEmailContacted,
  recordContacted,
  markLeadReplied,
  getLeadsDueForFollowUp,
  getFollowUpQueueStats,
  recordFollowUpSent,
  logResult,
};
