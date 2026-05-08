//TODO Покупка за монеты/кристаллы

const buyShopItemsService = require('../../services/shop/buyShopItemsService');
const logger = require('../../logger');

module.exports = {
  buyItems: async (req,res) => {
    const{itemId} = req.body;
    const telegramId = req.telegramId;
    try{
      //logger.info(`[buyShopItemsHandler, buyItems] Покупка itemId=${itemId} для telegramId=${telegramId}`);
      const resultBuy = await buyShopItemsService.buyShopItems(telegramId,itemId);
      //logger.info(`[buyShopItemsHandler, buyItems] Покупка itemId=${itemId} для telegramId=${telegramId} завршена`);
      res.status(200).json(resultBuy);
    } catch(error) {
      logger.error(`[buyShopItemsHandler, buyItems] Ошибка: ${error.message}`)
      res.status(500).json({error: error.message});
    }
  } 
}