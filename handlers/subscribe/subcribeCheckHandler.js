//TODO Проверка подписки
const subCheck = require('../../services/subscribe/subcribeCheckService');
const logger = require('../../logger');

module.exports = {
  subcribeCheck: async (req, res) =>{
    try{
      const telegramId = req.telegramId;
      //logger.info(`[subcribeCheckHandler, subcribeCheck] Проверяем статус подписки для telegramId=${telegramId}`);
      const sub = await subCheck.subDesc(telegramId);
      res.status(200).json(sub);
    } 
    catch (error) {
      logger.error(`[subcribeCheckHandler, subcribeCheck] Ошибка для telegramId=${telegramId}: ${error.message}`)
      res.status(500).json({ error: error.message });
    }
  },
}