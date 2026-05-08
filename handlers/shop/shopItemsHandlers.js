//TODO Магазин

const shopItemsService = require('../../services/shop/shopItemsService');
const logger = require('../../logger');

module.exports = {
  openShop: async (req,res) => {
    try{
      const { type = 'background' } = req.body;
      const telegramId = req.telegramId;
      //logger.info(`[shopItemsHandlers, openShop] Открытие сокровищницы для telegramId=${telegramId}`);
      const shop = await shopItemsService.shopOpen(telegramId,type);
      //logger.info(`[shopItemsHandlers, openShop] Сокровищница открыта для telegramId=${telegramId}`);  
      res.status(200).json(shop);
    } catch(error) {
      logger.error(`[shopItemsHandlers, openShop] Ошибка: ${error.message}`)
      res.status(500).json({error: error.message});
    }
  }
}
