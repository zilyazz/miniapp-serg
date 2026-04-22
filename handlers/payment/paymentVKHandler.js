const logger = require('../../logger');
const vkPaymentsService = require('../../services/vkPaymentsService');

module.exports = {
  createCrystalPaymentVKVotes: async (req, res) => {
    try {
      const userKey = req.telegramId;
      const { id } = req.body || {};

      const order = await vkPaymentsService.createVKInvoice(userKey, id);
      return res.json(order);
    } catch (error) {
      logger.error(`[paymentVKHandler, createCrystalPaymentVKVotes] ${error.message}`);
      return res.status(500).json({ error: error.message });
    }
  },
};
