//TODO История раскладов

const spreadService = require('../services/spreadService');
const logger = require('../logger');

module.exports = {
  getSpreadHistory: async (req,res) => {
    try{
      const telegramId = req.telegramId;
      const getSpreadHistory = await spreadService.getSpreadHistory(telegramId);
      res.status(200).json(getSpreadHistory);
    } catch (error) {
      logger.error(`[spreadHandler, getSpreadHistory] Ошибка: ${error.message}`);
      res.status(500).json({error: error.message})
    }
  },
  getSpreadDetails: async(req,res) => {
    try{
      const{spreadId} = req.params;
      const getSpreadDetails = await spreadService.getSpreadDetails(spreadId);
      res.status(200).json(getSpreadDetails)
    } catch(error) {
      logger.error(`[spreadHandler, getSpreadDetails] Ошибка: ${error.message}`);
      res.status(500).json({error: error.message})
    }
  }
}