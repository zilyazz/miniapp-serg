//TODO Покупка подписки

const subBuy = require('../../services/subscribe/subscriveBuyService');
const logger = require('../../logger');

module.exports = {
  subscribeBuyCrystal: async(req,res) => {
    const telegramId = req.telegramId;
    try{
      const{id} = req.body;
      //logger.info(`[subscribeBuyHandler, subscribeBuyCrystal] Купим подписку id=${id} для telegramId=${telegramId}`);
      const result = await subBuy.subscrBuy(id,telegramId);
      
      res.status(200).json({result});
    } catch(error) {
      logger.error(`[subscribeBuyHandler, subscribeBuyCrystal] Ошибка для telegramId=${telegramId}: ${error.message}`)
      res.status(500).json({error: error.message});
    }
  }
}
