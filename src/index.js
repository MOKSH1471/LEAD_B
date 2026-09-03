const { validateConfig } = require('./config');
const { runCampaign } = require('./pipeline');

async function main() {
  validateConfig();
  await runCampaign();
}

main().catch((err) => {
  console.error('Fatal error:', err);
});
