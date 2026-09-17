module.exports = {
  apps: [
    {
      name: 'discovery-agent',
      script: 'src/agents/discoveryAgent.js',
      restart_delay: 3000,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'verification-agent',
      script: 'src/agents/verificationAgent.js',
      restart_delay: 3000,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'personalization-agent',
      script: 'src/agents/personalizationAgent.js',
      restart_delay: 3000,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'dispatch-agent',
      script: 'src/agents/dispatchAgent.js',
      restart_delay: 3000,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'monitoring-agent',
      script: 'src/agents/monitoringAgent.js',
      restart_delay: 5000,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
