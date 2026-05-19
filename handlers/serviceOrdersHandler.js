const logger = require('../logger');
const serviceOrdersService = require('../services/serviceOrdersService');

function isBadRequest(code) {
  return [
    'service_id_required',
    'email_required',
    'invalid_pay_method',
    'invalid_input_data',
    'service_product_not_found',
    'service_product_inactive',
    'invalid_service_price',
    'service_stars_price_not_set',
    'telegram_stars_only',
    'order_id_required',
    'service_order_not_found',
  ].includes(code);
}

function isConflict(code) {
  return code === 'telegram_username_required';
}

module.exports = {
  listCatalog: async (req, res) => {
    try {
      const catalog = await serviceOrdersService.listServiceCatalog();
      return res.json(catalog);
    } catch (error) {
      logger.error(`[serviceOrdersHandler, listCatalog] ${error.message}`);
      return res.status(500).json({ error: 'service_catalog_failed' });
    }
  },

  createYooKassaInvoice: async (req, res) => {
    try {
      const userKey = req.telegramId;
      const invoice = await serviceOrdersService.createYooKassaInvoice(userKey, req.body || {});
      return res.json(invoice);
    } catch (error) {
      logger.error(`[serviceOrdersHandler, createYooKassaInvoice] ${error.message}`);
      const code = error.code || error.message;
      if (isConflict(code)) {
        return res.status(409).json({
          error: code,
          message: 'Для покупки консультации откройте видимость username в Telegram и перезайдите в мини-приложение.',
        });
      }
      return res.status(isBadRequest(code) ? 400 : 500).json({ error: code });
    }
  },

  createTelegramStarsInvoice: async (req, res) => {
    try {
      const userKey = req.telegramId;
      const invoice = await serviceOrdersService.createTelegramStarsInvoice(userKey, req.body || {});
      return res.json(invoice);
    } catch (error) {
      logger.error(`[serviceOrdersHandler, createTelegramStarsInvoice] ${error.message}`);
      const code = error.code || error.message;
      if (isConflict(code)) {
        return res.status(409).json({
          error: code,
          message: 'Для покупки консультации откройте видимость username в Telegram и перезайдите в мини-приложение.',
        });
      }
      return res.status(isBadRequest(code) ? 400 : 500).json({ error: code });
    }
  },

  updateInput: async (req, res) => {
    try {
      const userKey = req.telegramId;
      const result = await serviceOrdersService.updateOrderInput(
        userKey,
        req.params.orderId,
        req.body?.input_data
      );
      return res.json(result);
    } catch (error) {
      logger.error(`[serviceOrdersHandler, updateInput] ${error.message}`);
      const code = error.code || error.message;
      return res.status(isBadRequest(code) ? 400 : 500).json({ error: code });
    }
  },
};
