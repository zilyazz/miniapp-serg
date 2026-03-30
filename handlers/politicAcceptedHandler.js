const termAccepted = require('../services/politicAcceptedService');
const logger = require('../logger');

module.exports = {
  termAccepted: async (req,res) => {
    try {
      const {telegramId}  = req.params;
      const result = await termAccepted.termAccepted(telegramId);

      res.status(200).json(result);
    } catch (error) {
        logger.error(`[politicAcceptedHandler, termAccepted] Ошибка: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
  },  
}