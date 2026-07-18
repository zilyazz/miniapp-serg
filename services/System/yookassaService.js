const axios = require('axios');
const { trackExternalCall } = require('../metrics/metricsService');

const SHOP_ID = process.env.YOOKASSA_SHOP_ID;
const SECRET_KEY = process.env.YOOKASSA_SECRET_KEY || process.env.YOOKASSA_API_KEY;
const RETURN_URL = process.env.YOOKASSA_RETURN_URL;
const API_BASE_URL = (process.env.YOOKASSA_API_BASE_URL || 'https://api.yookassa.ru/v3').replace(/\/+$/, '');

function ensureConfigured() {
  if (!SHOP_ID) {
    const err = new Error('yookassa_shop_id_missing');
    err.code = 'yookassa_shop_id_missing';
    throw err;
  }

  if (!SECRET_KEY) {
    const err = new Error('yookassa_api_key_missing');
    err.code = 'yookassa_api_key_missing';
    throw err;
  }

  if (!RETURN_URL) {
    const err = new Error('yookassa_return_url_missing');
    err.code = 'yookassa_return_url_missing';
    throw err;
  }
}

function buildAuthHeader() {
  return `Basic ${Buffer.from(`${SHOP_ID}:${SECRET_KEY}`).toString('base64')}`;
}

async function createPayment({ amountRub, description, paymentId, email, method, metadata = {}, paymentSubject = 'commodity' }) {
  ensureConfigured();

  const payload = {
    amount: {
      value: Number(amountRub).toFixed(2),
      currency: 'RUB',
    },
    capture: true,
    confirmation: {
      type: 'redirect',
      return_url: RETURN_URL,
    },
    description: String(description || '').trim(),
    metadata: {
      payment_id: String(paymentId || '').trim(),
      ...metadata,
    },
    receipt: {
      customer: {
        email: String(email || '').trim(),
      },
      items: [
        {
          description: String(description || '').trim(),
          quantity: '1.00',
          amount: {
            value: Number(amountRub).toFixed(2),
            currency: 'RUB',
          },
          vat_code: 1,
          payment_mode: 'full_payment',
          payment_subject: paymentSubject,
        },
      ],
    },
  };

  if (method) {
    payload.payment_method_data = { type: method };
  }

  const response = await trackExternalCall(
    'yookassa_create_payment',
    () => axios.post(`${API_BASE_URL}/payments`, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': buildAuthHeader(),
        'Idempotence-Key': String(paymentId || '').trim(),
      },
      timeout: Number(process.env.YOOKASSA_TIMEOUT_MS || 30000),
    })
  );

  return normalizePayment(response.data);
}

async function getPayment(providerPaymentId) {
  ensureConfigured();

  const response = await trackExternalCall(
    'yookassa_get_payment',
    () => axios.get(`${API_BASE_URL}/payments/${String(providerPaymentId || '').trim()}`, {
      headers: {
        'Authorization': buildAuthHeader(),
      },
      timeout: Number(process.env.YOOKASSA_TIMEOUT_MS || 30000),
    })
  );

  return normalizePayment(response.data);
}

function normalizePayment(item) {
  return {
    id: String(item?.id || '').trim(),
    status: String(item?.status || '').trim(),
    paid: !!item?.paid,
    confirmation_url: String(item?.confirmation?.confirmation_url || item?.confirmation?.url || '').trim(),
    metadata: item?.metadata || {},
  };
}

module.exports = {
  createPayment,
  getPayment,
};
