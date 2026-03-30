const logger = require('../../logger');
const supabase = require('../../supabaseClient');
const cryptoPay = require('../../services/System/cryptoPayService');
const createTGInvoice = require('../../services/telegramPaymentsService');
//const createStaffInvoice = require('../../services/stav/stavPaymentService');

module.exports = {
  handleCryptoPayWebhook: async (req, res) => {
    try {
      const signature = req.headers['crypto-pay-api-signature'];
      const rawBody = req.body.toString('utf8');

      if (!cryptoPay.verifyWebhookSignature(rawBody, signature)) {
        return res.status(401).send('bad signature');
      }

      const update = JSON.parse(rawBody);

      if (update.update_type !== 'invoice_paid') {
        return res.sendStatus(200);
      }

      const invoice = update.payload;
      const paymentId = invoice.payload; // ты его сам передал как payment_id :contentReference[oaicite:17]{index=17}

      const { data: payRow, error } = await supabase
        .from('payments')
        .select('product_table, final_price')
        .eq('payment_id', paymentId)
        .single();

      if (error || !payRow) {
        logger.error(`[cryptoPayWebhook] payment not found ${paymentId}: ${error?.message}`);
        return res.sendStatus(200);
      }

      const paidAmountInt = Math.round(payRow.final_price * 100);

      if (payRow.product_table === 'staf_requests') {
        await createStaffInvoice.WeebhookTGBotStaf(paymentId, paidAmountInt);
        return res.sendStatus(200);
      }

      // кристаллы: optionId живёт в paymentId ("<id>_<telegramId><DateNow>")
      const optionId = parseInt(paymentId.split('_')[0], 10);
      await createTGInvoice.WeebhookTGBot(paymentId, optionId, paidAmountInt);

      return res.sendStatus(200);
    } catch (e) {
      logger.error(`[cryptoPayWebhook] error: ${e.message}`);
      return res.sendStatus(200); // чтобы криптобот не долбил ретраями бесконечно
    }
  }
};
