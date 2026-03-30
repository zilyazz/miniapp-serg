
const axios = require('axios');
const crypto = require('crypto');

const TOKEN = process.env.CRYPTOPAY_TOKEN;
const BASE = process.env.CRYPTOPAY_BASE_URL || 'https://pay.crypt.bot';

async function createInvoice({ amountRub, description, paymentId, expiresInSec = 1800 }) {
  // Создаём инвойс в ФИАТЕ (RUB), а платить можно криптой (accepted_assets)
  const res = await axios.post(
    `${BASE}/api/createInvoice`,
    {
      currency_type: 'fiat',
      fiat: 'RUB',
      amount: amountRub.toFixed(2),      // строка "125.50" :contentReference[oaicite:6]{index=6}
      accepted_assets: 'USDT,TON,BTC,ETH,LTC,BNB,TRX,USDC', // опционально :contentReference[oaicite:7]{index=7}
      description,
      payload: paymentId,                // до 4kb :contentReference[oaicite:8]{index=8}
      expires_in: expiresInSec
    },
    { headers: { 'Crypto-Pay-API-Token': TOKEN } } // :contentReference[oaicite:9]{index=9}
  );

  if (!res.data?.ok) throw new Error(res.data?.error || 'CRYPTOPAY_CREATE_INVOICE_FAILED');
  return res.data.result; // Invoice object
}

// Проверка подписи вебхука: HMAC-SHA256(body) с секретом = SHA256(token) :contentReference[oaicite:10]{index=10}
function verifyWebhookSignature(rawBody, signatureHeader) {
  const secret = crypto.createHash('sha256').update(TOKEN).digest();
  const hmac = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return hmac === signatureHeader;
}

module.exports = { createInvoice, verifyWebhookSignature };
