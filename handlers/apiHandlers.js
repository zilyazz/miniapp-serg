//TODO Генерация расклада 

const runeService = require('../services/runeService');
const logger = require('../logger');
module.exports = {
  generateLayout: async (req, res) => {
    const { theme,type,useCrystals} = req.body;
    //const { theme,type,useScore, amount} = req.body;
    const telegramId = req.telegramId;
    
    try {
      //logger.info(`[apiHandlers, generateLayout] Генерация расклада для telegramId=${telegramId}`);
      const layout = await runeService.generateLayout(telegramId,theme,type,useCrystals);
      if (layout.error === 'not_enough_crystals') {
        return res.status(400).json(layout); // 400 — ошибка клиента
      }
      //logger.info(`[apiHandlers, generateLayout] Добавление в историю расклада для telegramId=${telegramId}`);
      await runeService.insertInSpreadAndLimit(telegramId,layout);

      res.status(200).json(layout);

    } catch (error) {
      logger.error(`[apiHandlers, generateLayout] Ошибка для telegramId=${telegramId}: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  }, 
}
