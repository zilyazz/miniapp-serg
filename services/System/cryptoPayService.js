
const axios = require('axios');
const crypto = require('crypto');
const { trackExternalCall } = require('../metrics/metricsService');

const TOKEN = process.env.CRYPTOPAY_TOKEN;
const BASE = process.env.CRYPTOPAY_BASE_URL || 'https://pay.crypt.bot';

async function createInvoice({ amountRub, description, paymentId, expiresInSec = 1800 }) {
  // Создаём инвойс в ФИАТЕ (RUB), а платить можно криптой (accepted_assets)
  return trackExternalCall(
    'cryptopay_create_invoice',
    async () => {
      const res = await axios.post(
        `${BASE}/api/createInvoice`,
        {
          currency_type: 'fiat',
          fiat: 'RUB',
          amount: amountRub.toFixed(2),
          accepted_assets: 'USDT,TON,BTC,ETH,LTC,BNB,TRX,USDC',
          description,
          payload: paymentId,
          expires_in: expiresInSec
        },
        {
          headers: { 'Crypto-Pay-API-Token': TOKEN },
          timeout: Number(process.env.CRYPTOPAY_TIMEOUT_MS || 30000)
        }
      );

      if (!res.data?.ok) {
        const error = new Error(res.data?.error || 'CRYPTOPAY_CREATE_INVOICE_FAILED');
        error.code = 'cryptopay_create_invoice_failed';
        throw error;
      }
      return res.data.result;
    }
  );
}

// Проверка подписи вебхука: HMAC-SHA256(body) с секретом = SHA256(token) :contentReference[oaicite:10]{index=10}
function verifyWebhookSignature(rawBody, signatureHeader) {
  const secret = crypto.createHash('sha256').update(TOKEN).digest();
  const hmac = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return hmac === signatureHeader;
}

module.exports = { createInvoice, verifyWebhookSignature };
