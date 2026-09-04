const { config, validateConfig } = require('./config');
const { runCampaign } = require('./pipeline');
const { runFollowUpSweep } = require('./followUpEngine');
const fs = require('fs');
const path = require('path');

const STATE_FILE = path.resolve(process.cwd(), 'autopilot_state.json');

let isAutopilotRunning = false;
let currentTimeoutId = null;
let isCycleInProgress = false;
let shouldAbortCurrentCycle = false;

let state = {
  nicheIndex: 0,
  regionIndex: 0,
  totalCyclesCompleted: 0,
  lastRunAt: null,
  nextRunAt: null,
};

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
      state = { ...state, ...data };
    }
  } catch (e) {}
}

function saveState() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (e) {}
}

loadState();

/**
 * Runs a single full Autopilot cycle:
 * Step 1: Follow-Up Sweep for all overdue prospects
 * Step 2: New Prospecting Batch for next scheduled niche & region
 */
async function executeAutopilotCycle({ onProgress = console.log, onAlert = () => {} } = {}) {
  if (isCycleInProgress) {
    await onProgress('⚠️ Autopilot cycle already in progress, skipping duplicate run.');
    return;
  }

  isCycleInProgress = true;
  shouldAbortCurrentCycle = false;

  const notify = async (msg) => {
    console.log(msg);
    try {
      await onProgress(msg);
    } catch (e) {}
  };

  try {
    await notify(`🤖 *[Autopilot Active]* Starting autonomous outreach & follow-up cycle...`);

    // STEP 1: Process Overdue Follow-Ups
    await notify(`🔍 *[Autopilot Step 1/2]* Checking follow-up queue...`);
    await runFollowUpSweep({
      dryRun: config.dryRun,
      onProgress: notify,
      shouldAbort: () => shouldAbortCurrentCycle,
    });

    if (shouldAbortCurrentCycle) {
      await notify('🛑 Autopilot cycle aborted.');
      return;
    }

    // STEP 2: Autonomous Prospecting Batch
    const niches = config.autopilotNiches.length > 0 ? config.autopilotNiches : [config.niche];
    const regions = config.autopilotRegions.length > 0 ? config.autopilotRegions : [config.region];

    const currentNiche = niches[state.nicheIndex % niches.length];
    const currentRegion = regions[state.regionIndex % regions.length];

    await notify(`🎯 *[Autopilot Step 2/2]* Prospecting new clients:\n• *Niche:* ${currentNiche}\n• *Region:* ${currentRegion}\n• *Batch Goal:* ${config.autopilotBatchSize} emails`);

    await runCampaign({
      niche: currentNiche,
      region: currentRegion,
      maxResults: config.autopilotBatchSize,
      dryRun: config.dryRun,
      onProgress: notify,
      shouldAbort: () => shouldAbortCurrentCycle,
    });

    // Advance rotation indices for next cycle
    state.regionIndex = (state.regionIndex + 1) % regions.length;
    if (state.regionIndex === 0) {
      state.nicheIndex = (state.nicheIndex + 1) % niches.length;
    }

    state.totalCyclesCompleted++;
    state.lastRunAt = new Date().toISOString();

    const nextDelayMs = (config.autopilotIntervalHours || 12) * 60 * 60 * 1000;
    state.nextRunAt = new Date(Date.now() + nextDelayMs).toISOString();
    saveState();

    await notify(`✨ *[Autopilot Cycle Complete]* Next autonomous run scheduled at: _${new Date(state.nextRunAt).toLocaleString()}_`);
  } catch (err) {
    await notify(`❌ *[Autopilot Error]:* ${err.message}`);
  } finally {
    isCycleInProgress = false;
    shouldAbortCurrentCycle = false;
  }
}

/**
 * Starts continuous background autopilot
 */
function startAutopilot({ onProgress = console.log, onAlert = () => {} } = {}) {
  if (isAutopilotRunning) {
    return false;
  }

  isAutopilotRunning = true;
  const intervalMs = (config.autopilotIntervalHours || 12) * 60 * 60 * 1000;

  // Run initial cycle immediately
  setImmediate(async () => {
    await executeAutopilotCycle({ onProgress, onAlert });
    scheduleNext(intervalMs, onProgress, onAlert);
  });

  return true;
}

function scheduleNext(intervalMs, onProgress, onAlert) {
  if (!isAutopilotRunning) return;

  state.nextRunAt = new Date(Date.now() + intervalMs).toISOString();
  saveState();

  currentTimeoutId = setTimeout(async () => {
    if (isAutopilotRunning) {
      await executeAutopilotCycle({ onProgress, onAlert });
      scheduleNext(intervalMs, onProgress, onAlert);
    }
  }, intervalMs);
}

/**
 * Stops background autopilot
 */
function stopAutopilot() {
  if (!isAutopilotRunning) return false;

  isAutopilotRunning = false;
  shouldAbortCurrentCycle = true;

  if (currentTimeoutId) {
    clearTimeout(currentTimeoutId);
    currentTimeoutId = null;
  }

  state.nextRunAt = null;
  saveState();
  return true;
}

function getAutopilotStatus() {
  const niches = config.autopilotNiches.length > 0 ? config.autopilotNiches : [config.niche];
  const regions = config.autopilotRegions.length > 0 ? config.autopilotRegions : [config.region];

  const nextNiche = niches[state.nicheIndex % niches.length];
  const nextRegion = regions[state.regionIndex % regions.length];

  return {
    isActive: isAutopilotRunning,
    isCycleInProgress,
    intervalHours: config.autopilotIntervalHours,
    batchSize: config.autopilotBatchSize,
    totalCyclesCompleted: state.totalCyclesCompleted,
    lastRunAt: state.lastRunAt,
    nextRunAt: state.nextRunAt,
    nextTarget: {
      niche: nextNiche,
      region: nextRegion,
    },
    configuredNiches: niches,
    configuredRegions: regions,
  };
}

// Standalone CLI runner
if (require.main === module) {
  validateConfig();
  console.log('🤖 Launching Autopilot Autonomous Lead Hunter & Follow-Up Engine...');
  startAutopilot({
    onProgress: (msg) => console.log(msg.replace(/[*_`]/g, '')),
  });

  process.once('SIGINT', () => {
    console.log('\n🛑 Stopping Autopilot gracefully...');
    stopAutopilot();
    process.exit(0);
  });
}

module.exports = {
  startAutopilot,
  stopAutopilot,
  executeAutopilotCycle,
  getAutopilotStatus,
};
