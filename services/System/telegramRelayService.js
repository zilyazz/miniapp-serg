const axios = require('axios');

const TELEGRAM_RELAY_BASE_URL = (process.env.TELEGRAM_RELAY_BASE_URL || '').trim().replace(/\/+$/, '');
const TELEGRAM_RELAY_SECRET = (process.env.TELEGRAM_RELAY_SECRET || '').trim();

function isTelegramRelayConfigured() {
  return TELEGRAM_RELAY_BASE_URL !== '';
}

async function createInvoiceLinkViaRelay(payload) {
  if (!isTelegramRelayConfigured()) {
    const err = new Error('telegram_relay_not_configured');
    err.code = 'telegram_relay_not_configured';
    throw err;
  }

  const headers = {
    'Content-Type': 'application/json',
  };

  if (TELEGRAM_RELAY_SECRET) {
    headers['X-Relay-Secret'] = TELEGRAM_RELAY_SECRET;
  }

  const response = await axios.post(
    `${TELEGRAM_RELAY_BASE_URL}/telegram/create-invoice-link`,
    payload,
    { headers }
  );

  const responseData = response?.data || {};
  if (!responseData.ok || !String(responseData.result || '').trim()) {
    const err = new Error(
      `telegram_relay_create_invoice_failed: ${String(responseData.description || 'empty result').trim()}`
    );
    err.code = 'telegram_relay_create_invoice_failed';
    throw err;
  }

  return String(responseData.result).trim();
}

async function answerPreCheckoutViaRelay(preCheckoutQueryId, ok = true, errorMessage = '') {
  if (!isTelegramRelayConfigured()) {
    const err = new Error('telegram_relay_not_configured');
    err.code = 'telegram_relay_not_configured';
    throw err;
  }

  const headers = {
    'Content-Type': 'application/json',
  };

  if (TELEGRAM_RELAY_SECRET) {
    headers['X-Relay-Secret'] = TELEGRAM_RELAY_SECRET;
  }

  const payload = {
    pre_checkout_query_id: preCheckoutQueryId,
    ok,
  };

  if (!ok && errorMessage) {
    payload.error_message = errorMessage;
  }

  const response = await axios.post(
    `${TELEGRAM_RELAY_BASE_URL}/telegram/answer-precheckout`,
    payload,
    { headers }
  );

  const responseData = response?.data || {};
  if (!responseData.ok) {
    const err = new Error(
      `telegram_relay_answer_precheckout_failed: ${String(responseData.description || 'empty result').trim()}`
    );
    err.code = 'telegram_relay_answer_precheckout_failed';
    throw err;
  }

  return responseData.result;
}

async function sendMessageViaRelay({ chatId, text, replyMarkup }) {
  if (!isTelegramRelayConfigured()) {
    const err = new Error('telegram_relay_not_configured');
    err.code = 'telegram_relay_not_configured';
    throw err;
  }

  const headers = {
    'Content-Type': 'application/json',
  };

  if (TELEGRAM_RELAY_SECRET) {
    headers['X-Relay-Secret'] = TELEGRAM_RELAY_SECRET;
  }

  const payload = {
    chat_id: chatId,
    text,
  };

  if (replyMarkup) {
    payload.reply_markup = replyMarkup;
  }

  const response = await axios.post(
    `${TELEGRAM_RELAY_BASE_URL}/telegram/send-message`,
    payload,
    { headers }
  );

  const responseData = response?.data || {};
  if (!responseData.ok) {
    const err = new Error(
      `telegram_relay_send_message_failed: ${String(responseData.description || responseData.error || 'empty result').trim()}`
    );
    err.code = 'telegram_relay_send_message_failed';
    throw err;
  }

  return responseData.result;
}

module.exports = {
  isTelegramRelayConfigured,
  createInvoiceLinkViaRelay,
  answerPreCheckoutViaRelay,
  sendMessageViaRelay,
};
