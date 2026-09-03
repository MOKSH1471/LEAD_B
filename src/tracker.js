const fs = require('fs');
const path = require('path');

const CONTACTED_FILE = path.resolve(process.cwd(), 'contacted.json');
const RESULTS_CSV = path.resolve(process.cwd(), 'results.csv');

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

function recordContacted({ placeId, email, name, status, pointers }) {
  const timestamp = new Date().toISOString();
  const entry = {
    name,
    email: email ? email.toLowerCase().trim() : '',
    status,
    pointers: pointers || [],
    contactedAt: timestamp,
  };

  if (placeId) {
    contactedData.placeIds[placeId] = entry;
  }
  if (email) {
    contactedData.emails[email.toLowerCase().trim()] = entry;
  }

  saveContacted();
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
  logResult,
};
