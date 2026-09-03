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

const config = {
  // Search Provider: 'osm' (OpenStreetMap - 100% Free, no keys/cards) or 'google' (Google Places API)
  searchProvider: getEnv('SEARCH_PROVIDER', defaultProvider).toLowerCase(),

  // API Keys
  googlePlacesApiKey: rawGoogleKey,
  geminiApiKey: getEnv('GEMINI_API_KEY', '', false),

  // Email Config
  gmailUser: getEnv('GMAIL_USER', '', false),
  gmailAppPassword: getEnv('GMAIL_APP_PASSWORD', '', false),
  fromName: getEnv('FROM_NAME', 'Freelance Web Consultant'),

  // Search parameters
  niche: getEnv('NICHE', 'dentists'),
  region: getEnv('REGION', 'Austin, TX'),
  maxResults: parseInt(getEnv('MAX_RESULTS', '20'), 10),

  // Safety & throttling
  dryRun: getEnv('DRY_RUN', 'true').toLowerCase() === 'true',
  emailDelayMs: parseInt(getEnv('EMAIL_DELAY_MS', '30000'), 10),
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
    if (!config.gmailUser) missing.push('GMAIL_USER');
    if (!config.gmailAppPassword) missing.push('GMAIL_APP_PASSWORD');
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
