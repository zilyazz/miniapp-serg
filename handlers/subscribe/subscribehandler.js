//TODO Варианты подписки

const sub = require('../../services/subscribe/subscribeService');
const logger = require('../../logger');

module.exports = {
  subcribe: async (req,res) => {
    try{
      //logger.info(`[subscribehandler, subcribe] Покажем варианты подписки`);
      const result = await sub.subDesc();

      res.status(200).json({result});
      
    } catch(error) {
      logger.error(`[subscribehandler, subcribe] Ошибка: ${error.message}`);
      res.status(500).json({error: error.message});
    }
  }
}