const path = require('path');
const dotenv = require('dotenv');

// Load .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function getEnv(key, defaultValue = undefined, required = false) {
  const value = process.env[key];
  if (!value && required) {
    throw new Error(`[Config Error] Missing required environment variable: ${key}. Please check your .env file.`);
  }
  return value !== undefined && value !== '' ? value : defaultValue;
}

const rawGoogleKey = getEnv('GOOGLE_PLACES_API_KEY', '', false);
const defaultProvider = rawGoogleKey ? 'google' : 'osm';

const emailUser = getEnv('EMAIL_USER', getEnv('GMAIL_USER', '', false), false);
const emailPass = getEnv('EMAIL_PASS', getEnv('GMAIL_APP_PASSWORD', '', false), false);

// Intelligent provider detection:
const isGmail = emailUser && emailUser.toLowerCase().endsWith('@gmail.com');
const rawSmtpHost = process.env.SMTP_HOST;
const rawImapHost = process.env.IMAP_HOST;

// If active email is a gmail address, default to gmail servers unless explicitly forced to another server
const resolvedSmtpHost = isGmail && (!rawSmtpHost || rawSmtpHost === 'smtp.titan.email')
  ? 'smtp.gmail.com'
  : (rawSmtpHost || 'smtp.titan.email');

const resolvedImapHost = isGmail && (!rawImapHost || rawImapHost === 'imap.titan.email')
  ? 'imap.gmail.com'
  : (rawImapHost || 'imap.titan.email');

const resolvedSmtpPort = resolvedSmtpHost === 'smtp.gmail.com'
  ? 587
  : parseInt(getEnv('SMTP_PORT', '465'), 10);

const resolvedSmtpSecure = resolvedSmtpHost === 'smtp.gmail.com'
  ? false
  : getEnv('SMTP_SECURE', 'true').toLowerCase() === 'true';

const config = {
  // Search Provider: 'osm' (OpenStreetMap - 100% Free, no keys/cards) or 'google' (Google Places API)
  searchProvider: getEnv('SEARCH_PROVIDER', defaultProvider).toLowerCase(),

  // API Keys
  googlePlacesApiKey: rawGoogleKey,
  geminiApiKey: getEnv('GEMINI_API_KEY', '', false),

  // Email / SMTP Settings (supports Titan / GoDaddy / Custom Domain / Gmail)
  emailUser,
  emailPass,
  gmailUser: emailUser, // backward compatibility
  gmailAppPassword: emailPass, // backward compatibility
  fromName: getEnv('FROM_NAME', 'Freelance Web Consultant'),

  smtpHost: resolvedSmtpHost,
  smtpPort: resolvedSmtpPort,
  smtpSecure: resolvedSmtpSecure,

  // IMAP Settings for Reply Tracking
  imapHost: resolvedImapHost,
  imapPort: parseInt(getEnv('IMAP_PORT', '993'), 10),
  imapSecure: getEnv('IMAP_SECURE', 'true').toLowerCase() === 'true',

  // Search parameters
  niche: getEnv('NICHE', 'dentists'),
  region: getEnv('REGION', 'Austin, TX'),
  maxResults: parseInt(getEnv('MAX_RESULTS', '50'), 10),

  // Safety & throttling
  dryRun: getEnv('DRY_RUN', 'false').toLowerCase() === 'true',
  emailDelayMs: parseInt(getEnv('EMAIL_DELAY_MS', '15000'), 10),

  // Follow-Up Configuration
  followUpDelayDays: parseFloat(getEnv('FOLLOWUP_DELAY_DAYS', '3')), // Days before Stage 1 follow-up
  followUpFinalDelayDays: parseFloat(getEnv('FOLLOWUP_FINAL_DELAY_DAYS', '4')), // Days after Stage 1 before Stage 2 breakup
  maxFollowUps: parseInt(getEnv('MAX_FOLLOWUPS', '2'), 10),

  // Autopilot Autonomous Client Prospecting & Follow-Up
  autopilotEnabled: getEnv('AUTOPILOT_ENABLED', 'false').toLowerCase() === 'true',
  autopilotIntervalHours: parseFloat(getEnv('AUTOPILOT_INTERVAL_HOURS', '12')),
  autopilotBatchSize: parseInt(getEnv('AUTOPILOT_BATCH_SIZE', '5'), 10),
  autopilotNiches: (getEnv('AUTOPILOT_NICHES', 'dentists, gyms, plumbers, roofing, chiropractors'))
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),
  autopilotRegions: (getEnv('AUTOPILOT_REGIONS', 'Austin, TX; Miami, FL; Chicago, IL; Dallas, TX; Phoenix, AZ'))
    .split(';')
    .map(s => s.trim())
    .filter(Boolean),
};

function validateConfig() {
  const missing = [];
  if (config.searchProvider === 'google' && !config.googlePlacesApiKey) {
    missing.push('GOOGLE_PLACES_API_KEY (needed when SEARCH_PROVIDER=google)');
  }
  if (!config.geminiApiKey) {
    missing.push('GEMINI_API_KEY (get free key from https://aistudio.google.com/)');
  }
  
  if (!config.dryRun) {
    if (!config.emailUser && !config.gmailUser) missing.push('EMAIL_USER (or GMAIL_USER)');
    if (!config.emailPass && !config.gmailAppPassword) missing.push('EMAIL_PASS (or GMAIL_APP_PASSWORD)');
  }

  if (missing.length > 0) {
    console.warn(`\n⚠️  [Config Warning] The following environment variables are not set in .env:`);
    missing.forEach(k => console.warn(`   - ${k}`));
    console.warn(`   (If running with mock or dry-run, some features may be simulated or fail without valid keys)\n`);
  }
}

module.exports = {
  config,
  validateConfig,
};
