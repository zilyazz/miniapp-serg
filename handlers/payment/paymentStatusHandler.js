//TODO Определить статус платежа
const paymentStatus = require('../../services/paymentStatusService');
const logger = require('../../logger');

module.exports = {
  statPayment: async(req,res) =>{
    try{
      const {payment_id} = req.body;
      const telegramId = req.telegramId;
      const stat = await paymentStatus.checkStatusPayment(telegramId,payment_id);
      res.status(200).json(stat);
    } catch (error) {
        logger.error(`[paymentStatusHandler, statPayment] Ошибка: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
  },
};