const logger = require('../../logger');
const vkPaymentsService = require('../../services/vkPaymentsService');

module.exports = {
  handleVKPaymentsWebhook: async (req, res) => {
    try {
      const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
      const responsePayload = await vkPaymentsService.handleVKWebhook(
        rawBody,
        req.headers['content-type']
      );

      return res.status(200).json(responsePayload);
    } catch (error) {
      logger.error(`[webhookVKPaymentsHandler] ${error.message}`);
      return res.status(200).json({
        error: {
          error_code: 100,
          error_msg: 'internal webhook error',
          critical: true,
        },
      });
    }
  },
};
