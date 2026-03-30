//TODO Проверка доступности генерации расклада для пользователя базовой версии 

const layoutLimitService = require('../services/layoutLimitService')
const logger = require('../logger');

module.exports = {
  checkCountLayout: async(req,res) => {
    const {theme,type} = req.body;
    const telegramId = req.telegramId;
    try{
      const result = await layoutLimitService.isLayoutAllowed(telegramId,theme,type);

      res.json(result);
    } catch (error) {
      logger.error(`[layoutLimitHandler, checkCountLayout] Ошибка: ${error.message}`);
      res.status(500).json({message: error.message})
    }
  }
}