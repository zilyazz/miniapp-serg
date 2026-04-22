const crypto = require('crypto');
const supabase = require('../supabaseClient');
const logger = require('../logger');

const VK_ITEM_PREFIX = 'payment_';
const VK_NOTIFICATION_GET_ITEM = 'get_item';
const VK_NOTIFICATION_ORDER_STATUS_CHANGE = 'order_status_change';
const VK_SUCCESS_STATUSES = new Set(['', 'success', 'succeeded', 'paid', 'chargeable']);
const VK_SECRET = process.env.VK_APP_SECRET || '';

function buildVKItem(paymentId) {
  return `${VK_ITEM_PREFIX}${String(paymentId).trim()}`;
}

function parseVKItem(item) {
  const normalizedItem = String(item || '').trim();
  if (!normalizedItem.startsWith(VK_ITEM_PREFIX)) {
    return '';
  }

  return normalizedItem.slice(VK_ITEM_PREFIX.length);
}

function buildVKPaymentId(optionId, userKey) {
  const safeUserKey = String(userKey || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12) || 'user';
  return `vk_${optionId}_${Date.now()}_${safeUserKey}`;
}

function getVKVotesPrice(option) {
  const candidates = [option?.price_vk_votes, option?.price_stars];

  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isInteger(value) && value > 0) {
      return value;
    }
  }

  return 0;
}

async function getCrystalOption(id) {
  const { data: option, error } = await supabase
    .from('crystal_purchase_options')
    .select('id, crystals, description, price_vk_votes, price_stars')
    .eq('id', id)
    .single();

  if (error || !option) {
    logger.error(`[vkPaymentsService] crystal option lookup failed id=${id}: ${error?.message}`);
    throw new Error('Invalid purchase option');
  }

  return option;
}

async function createVKInvoice(userKey, id) {
  const option = await getCrystalOption(id);
  const amountVotes = getVKVotesPrice(option);

  if (amountVotes <= 0) {
    throw new Error('VK votes price is not set for this option');
  }

  const paymentId = buildVKPaymentId(id, userKey);
  const vkItem = buildVKItem(paymentId);

  const { error: payInsertError } = await supabase
    .from('payments')
    .insert({
      payment_id: paymentId,
      status: 'pending',
      description: option.description,
      telegram_id: userKey,
      crystals_give: false,
      id_crystal: id,
      final_price: amountVotes,
      pay_method: 'VK_VOTES',
    });

  if (payInsertError) {
    logger.error(`[vkPaymentsService] payment insert failed key=${userKey} option=${id}: ${payInsertError.message}`);
    throw payInsertError;
  }

  return {
    vk_item: vkItem,
    amount_votes: amountVotes,
    payment_id: paymentId,
    title: 'Покупка кристаллов',
    description: option.description,
  };
}

function parseVKWebhookBody(rawBody, contentType) {
  const normalizedType = String(contentType || '').trim().toLowerCase();
  const bodyText = String(rawBody || '').trim();

  if (!bodyText) {
    return new URLSearchParams();
  }

  if (normalizedType.includes('application/json')) {
    const payload = JSON.parse(bodyText);
    const values = new URLSearchParams();

    for (const [key, value] of Object.entries(payload)) {
      values.set(key, String(value));
    }

    return values;
  }

  return new URLSearchParams(bodyText);
}

function verifyVKWebhookSignature(values) {
  if (!VK_SECRET) {
    return true;
  }

  const signature = String(values.get('sig') || '').trim();
  if (!signature) {
    return false;
  }

  const keys = [];
  for (const key of values.keys()) {
    if (key === 'sig') {
      continue;
    }
    keys.push(key);
  }

  keys.sort();

  let base = '';
  for (const key of keys) {
    base += `${key}=${values.get(key)}`;
  }
  base += VK_SECRET;

  const expected = crypto.createHash('md5').update(base).digest('hex');
  return expected.toLowerCase() === signature.toLowerCase();
}

function buildVKErrorResponse(errorCode, message, critical = true) {
  return {
    error: {
      error_code: errorCode,
      error_msg: message,
      critical,
    },
  };
}

function buildVKGetItemResponse(item, title, price) {
  return {
    response: {
      title: String(title || 'Покупка кристаллов').slice(0, 48),
      price,
      item_id: item,
      expiration: 0,
    },
  };
}

function buildVKOrderStatusResponse(orderId, appOrderId) {
  return {
    response: {
      order_id: String(orderId || appOrderId),
      app_order_id: appOrderId,
    },
  };
}

async function getPaymentByVKItem(item) {
  const paymentId = parseVKItem(item);
  if (!paymentId) {
    return null;
  }

  const { data: payment, error } = await supabase
    .from('payments')
    .select('id, payment_id, status, crystals_give, id_crystal, final_price, description, telegram_id, pay_method')
    .eq('payment_id', paymentId)
    .single();

  if (error) {
    logger.error(`[vkPaymentsService] payment lookup failed item=${item}: ${error.message}`);
    return null;
  }

  return payment;
}

async function markPaymentFailed(paymentId) {
  const { error } = await supabase
    .from('payments')
    .update({
      status: 'failed',
      updated_at: new Date().toISOString(),
    })
    .eq('payment_id', paymentId);

  if (error) {
    logger.error(`[vkPaymentsService] mark failed payment_id=${paymentId}: ${error.message}`);
    throw error;
  }
}

async function markPaymentSucceeded(paymentId) {
  const { error } = await supabase.rpc('upd_crystal', {
    p_id: paymentId,
  });

  if (error) {
    logger.error(`[vkPaymentsService] upd_crystal failed payment_id=${paymentId}: ${error.message}`);
    throw error;
  }
}

async function handleVKGetItem(item) {
  const payment = await getPaymentByVKItem(item);
  if (!payment) {
    return buildVKErrorResponse(20, 'Product does not exist');
  }

  const option = await getCrystalOption(payment.id_crystal);
  const amountVotes = getVKVotesPrice(option);
  if (amountVotes <= 0) {
    return buildVKErrorResponse(20, 'Product does not exist');
  }

  return buildVKGetItemResponse(
    item,
    option.description || `Кристаллы x${option.crystals}`,
    amountVotes
  );
}

async function handleVKOrderStatusChange(values) {
  const item = String(values.get('item') || '').trim();
  const statusValue = String(values.get('status') || '').trim().toLowerCase();
  const orderId = String(values.get('order_id') || '').trim();

  const payment = await getPaymentByVKItem(item);
  if (!payment) {
    return buildVKErrorResponse(20, 'Product does not exist');
  }

  if (payment.status === 'succeeded' || payment.crystals_give) {
    return buildVKOrderStatusResponse(orderId, payment.id);
  }

  if (!VK_SUCCESS_STATUSES.has(statusValue)) {
    await markPaymentFailed(payment.payment_id);
    return buildVKOrderStatusResponse(orderId, payment.id);
  }

  await markPaymentSucceeded(payment.payment_id);
  return buildVKOrderStatusResponse(orderId, payment.id);
}

async function handleVKWebhook(rawBody, contentType) {
  const values = parseVKWebhookBody(rawBody, contentType);

  if (!verifyVKWebhookSignature(values)) {
    return buildVKErrorResponse(10, 'Bad signatures');
  }

  const notificationType = String(values.get('notification_type') || '').trim().toLowerCase();

  if (notificationType === VK_NOTIFICATION_GET_ITEM) {
    return handleVKGetItem(String(values.get('item') || '').trim());
  }

  if (notificationType === VK_NOTIFICATION_ORDER_STATUS_CHANGE) {
    return handleVKOrderStatusChange(values);
  }

  return buildVKErrorResponse(100, 'unsupported notification_type');
}

module.exports = {
  createVKInvoice,
  handleVKWebhook,
};
