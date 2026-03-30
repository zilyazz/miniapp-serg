require('dotenv').config();

module.exports = {
  token: process.env.TELEGRAM_BOT_TOKEN,
  webAppUrl: process.env.WEB_APP_URL,
  port: process.env.PORT,
};