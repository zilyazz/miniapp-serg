const tarotDayService = require('./tarotDay/tarotDayService');

async function flipRune(telegramId) {
  return tarotDayService.drawTarotDay(telegramId);
}

module.exports = {
  flipRune,
};
