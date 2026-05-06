const logger = require('../../logger');
const yookassaPaymentsService = require('../../services/yookassaPaymentsService');

module.exports = {
  handleWebhook: async (req, res) => {
    try {
      const handled = await yookassaPaymentsService.handleWebhook(req.body || {});
      return res.status(200).json({ ok: handled });
    } catch (error) {
      logger.error(`[yookassaWebhookHandler] ${error.message}`);
      return res.status(200).json({ ok: false });
    }
  },
};
