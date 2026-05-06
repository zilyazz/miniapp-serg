const logger = require('../../logger');
const yookassaPaymentsService = require('../../services/yookassaPaymentsService');

module.exports = {
  createCardInvoice: async (req, res) => {
    try {
      const userKey = req.telegramId;
      const { id, email } = req.body || {};
      const invoice = await yookassaPaymentsService.createCardInvoice(userKey, id, email);
      return res.json(invoice);
    } catch (error) {
      logger.error(`[paymentYooKassaHandler, createCardInvoice] ${error.message}`);
      const code = error.code || error.message;
      if (
        code === 'email_required' ||
        code === 'invalid_purchase_option' ||
        code === 'invalid_purchase_price'
      ) {
        return res.status(400).json({ error: code });
      }
      return res.status(500).json({ error: code });
    }
  },

  createYooMoneyInvoice: async (req, res) => {
    try {
      const userKey = req.telegramId;
      const { id, email } = req.body || {};
      const invoice = await yookassaPaymentsService.createYooMoneyInvoice(userKey, id, email);
      return res.json(invoice);
    } catch (error) {
      logger.error(`[paymentYooKassaHandler, createYooMoneyInvoice] ${error.message}`);
      const code = error.code || error.message;
      if (
        code === 'email_required' ||
        code === 'invalid_purchase_option' ||
        code === 'invalid_purchase_price'
      ) {
        return res.status(400).json({ error: code });
      }
      return res.status(500).json({ error: code });
    }
  },
};
