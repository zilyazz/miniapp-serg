const tarotDayService = require('../tarotDay/tarotDayService');

async function getOrCreateUserRune(userId) {
  const currentCard = await tarotDayService.getCurrentTarotDay(userId);
  return currentCard
    ? {
        rune: currentCard.card_key,
        interpretation: currentCard.interpretation,
        name: currentCard.name,
      }
    : {
        rune: null,
        interpretation: null,
        name: null,
      };
}

async function getRuneById(cardKey) {
  if (!cardKey) return null;

  return {
    card_key: cardKey,
  };
}

module.exports = {
  getOrCreateUserRune,
  getRuneById,
};
