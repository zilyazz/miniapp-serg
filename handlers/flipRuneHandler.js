//TODO Хендлер для перевораичвания руны дня
const flipDailyRune = require('../services/flipDailyRune');
const logger = require('../logger');

module.exports = {
  flipRune: async (req,res) => {
    try{
      const telegramId = req.telegramId;
      const newDailyRune = await flipDailyRune.flipRune(telegramId);
      return res.json({
        name: newDailyRune.name,
        card_key: newDailyRune.card_key,
        interpretation: newDailyRune.interpretation
      });
    } catch (error) {
      logger.error(`[flipRuneHandler, flipRune] Ошибка: ${error.message}`);

      const code = error?.code || error?.message;
      if (code === 'tarot_day_prompt_missing' || code === 'tarot_day_model_missing' || code === 'tarot_day_card_invalid') {
        return res.status(500).json({ error: code });
      }
      if (code === 'tarot_day_neural_failed') {
        return res.status(502).json({ error: code });
      }

      res.status(500).json({ error: code || 'internal_error' });
    }
  }
}
