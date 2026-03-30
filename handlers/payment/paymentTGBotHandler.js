//TODO Хэндлер для генерации ссылки на оплату (инвойс)

const logger = require('../../logger');
const createTGInvoice = require('../../services/telegramPaymentsService');

module.exports = {
  createCrystalPayment: async (req, res) => {
    try {
      const telegramId = req.telegramId;
      const { id, email, discountPercent } = req.body;
      const invoice = await createTGInvoice.createTelegramInvoice(telegramId,id, email, discountPercent)
      return res.json(invoice);
    } catch (error) {
      logger.error(`[paymentTGBotHandler, createCrystalPayment] Ошибка: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  },
  // ⭐ покупка кристаллов за звезды
  createCrystalPaymentStars: async (req, res) => {
    try {
      const telegramId = req.telegramId;
      const { id, discountPercent } = req.body; // email для Stars обычно не нужен
      const invoice = await createTGInvoice.createTelegramInvoiceStars(telegramId, id, discountPercent);
      return res.json(invoice);
    } catch (error) {
      logger.error(`[paymentTGBotHandler, createCrystalPaymentStars] Ошибка: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  },
  // Покупка кристаллов за крипту
  createCrystalPaymentCrypto: async (req, res) => {
    try {
      const telegramId = req.telegramId;
      const { id } = req.body;
  
      const invoice = await createTGInvoice.createTelegramInvoiceCrypto(telegramId, id);
      return res.json(invoice);
    } catch (e) {
      logger.error(`[paymentTGBotHandler, createCrystalPaymentCrypto] ${e.message}`);
      res.status(500).json({ error: e.message });
    }
  },
  
};
