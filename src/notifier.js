const axios = require('axios');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const subscribersFile = path.resolve(process.cwd(), 'subscribers.json');
const token = process.env.TELEGRAM_BOT_TOKEN;

async function sendTelegramAlert(messageText) {
  if (!token) return;

  let subscriberIds = [];
  try {
    if (fs.existsSync(subscribersFile)) {
      subscriberIds = JSON.parse(fs.readFileSync(subscribersFile, 'utf8'));
    }
  } catch (err) {
    return;
  }

  if (!Array.isArray(subscriberIds) || subscriberIds.length === 0) return;

  for (const chatId of subscriberIds) {
    try {
      await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
        chat_id: chatId,
        text: messageText,
        parse_mode: 'Markdown',
      });
    } catch (err) {
      // Ignore network or block errors
    }
  }
}

module.exports = { sendTelegramAlert };
