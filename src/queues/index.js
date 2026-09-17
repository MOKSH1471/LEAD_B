const { Queue } = require('bullmq');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function getRedisConnectionOptions() {
  const rawUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  try {
    const parsed = new URL(rawUrl);
    const options = {
      host: parsed.hostname || '127.0.0.1',
      port: parseInt(parsed.port || (parsed.protocol === 'rediss:' ? '6379' : '6379'), 10),
      username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
      password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
      maxRetriesPerRequest: null, // Mandatory for BullMQ
      enableReadyCheck: false,
    };

    if (parsed.protocol === 'rediss:') {
      options.tls = {
        rejectUnauthorized: false,
      };
    }

    return options;
  } catch (err) {
    console.warn(`⚠️ [Redis Config] Failed to parse REDIS_URL (${rawUrl}), falling back to 127.0.0.1:6379:`, err.message);
    return {
      host: '127.0.0.1',
      port: 6379,
      maxRetriesPerRequest: null,
    };
  }
}

const redisConnection = getRedisConnectionOptions();

const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000,
  },
  removeOnComplete: {
    age: 3600 * 24, // keep completed jobs for 24h
    count: 1000,
  },
  removeOnFail: {
    age: 3600 * 72, // keep failed jobs for 3 days
    count: 1000,
  },
};

const discoveryQueue = new Queue('discovery', {
  connection: redisConnection,
  defaultJobOptions,
});

const verificationQueue = new Queue('verification', {
  connection: redisConnection,
  defaultJobOptions,
});

const personalizationQueue = new Queue('personalization', {
  connection: redisConnection,
  defaultJobOptions,
});

const dispatchQueue = new Queue('dispatch', {
  connection: redisConnection,
  defaultJobOptions,
});

async function getQueueMetrics() {
  const queues = {
    discovery: discoveryQueue,
    verification: verificationQueue,
    personalization: personalizationQueue,
    dispatch: dispatchQueue,
  };

  const metrics = {};
  for (const [name, queue] of Object.entries(queues)) {
    try {
      const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed', 'paused');
      metrics[name] = counts;
    } catch (err) {
      metrics[name] = { error: err.message };
    }
  }
  return metrics;
}

module.exports = {
  redisConnection,
  discoveryQueue,
  verificationQueue,
  personalizationQueue,
  dispatchQueue,
  getQueueMetrics,
};
