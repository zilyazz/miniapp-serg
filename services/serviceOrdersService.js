const supabase = require('../supabaseClient');
const logger = require('../logger');
const yookassaClient = require('./System/yookassaService');
const telegramRelayService = require('./System/telegramRelayService');

const YOOKASSA_METHOD_CARD = 'bank_card';
const YOOKASSA_METHOD_YOOMONEY = 'yoo_money';
const ALLOWED_PAY_METHODS = new Set(['card', 'yoomoney']);

function normalizePayMethod(method) {
  const normalized = String(method || '').trim().toLowerCase();
  if (!ALLOWED_PAY_METHODS.has(normalized)) {
    logger.error(`[serviceOrdersService] invalid pay method method=${method}`);
    const err = new Error('invalid_pay_method');
    err.code = 'invalid_pay_method';
    throw err;
  }

  return normalized;
}

function toYooKassaMethod(method) {
  return method === 'card' ? YOOKASSA_METHOD_CARD : YOOKASSA_METHOD_YOOMONEY;
}

function toPaymentMethodCode(method) {
  return method === 'card' ? 'YOOKASSA_SERVICE_CARD' : 'YOOKASSA_SERVICE_YOOMONEY';
}

function toStarsPaymentMethodCode() {
  return 'TELEGRAM_SERVICE_STARS';
}

function buildPaymentId(method, serviceId, userKey) {
  const safeUserKey = String(userKey || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12) || 'user';
  return `svc_${method}_${serviceId}_${Date.now()}_${safeUserKey}`;
}

function normalizeInputData(inputData) {
  if (inputData == null) {
    return {};
  }

  if (typeof inputData !== 'object' || Array.isArray(inputData)) {
    logger.error('[serviceOrdersService] invalid input_data payload');
    const err = new Error('invalid_input_data');
    err.code = 'invalid_input_data';
    throw err;
  }

  return inputData;
}

function ensureServiceOrderContact(user) {
  if (user.authProvider !== 'telegram') {
    return;
  }

  if (String(user.username || '').trim()) {
    return;
  }

  logger.error(`[serviceOrdersService] telegram username required user_id=${user.id} telegram_real=${user.telegram_real}`);
  const err = new Error('telegram_username_required');
  err.code = 'telegram_username_required';
  throw err;
}

function ensureTelegramUser(user) {
  if (user.authProvider === 'telegram') {
    return;
  }

  logger.error(`[serviceOrdersService] telegram stars payment requested by non-telegram user_id=${user.id} provider=${user.authProvider}`);
  const err = new Error('telegram_stars_only');
  err.code = 'telegram_stars_only';
  throw err;
}

async function getCurrentUser(userKey) {
  const { data: user, error } = await supabase
    .from('users')
    .select('id, telegram, telegram_real, vk_real, username, source')
    .eq('telegram', userKey)
    .single();

  if (error || !user) {
    logger.error(`[serviceOrdersService] user lookup failed key=${userKey}: ${error?.message}`);
    const err = new Error('user_not_found');
    err.code = 'user_not_found';
    throw err;
  }

  const authProvider = user.vk_real ? 'vk' : 'telegram';
  const providerUserId = user.vk_real || user.telegram_real || null;

  return {
    ...user,
    authProvider,
    providerUserId,
  };
}

async function getServiceProduct(serviceId) {
  const { data: product, error } = await supabase
    .from('service_catalog')
    .select('id, title, description, price_money, price_stars, is_active')
    .eq('id', serviceId)
    .single();

  if (error || !product) {
    logger.error(`[serviceOrdersService] service product lookup failed id=${serviceId}: ${error?.message}`);
    const err = new Error('service_product_not_found');
    err.code = 'service_product_not_found';
    throw err;
  }

  if (!product.is_active) {
    logger.error(`[serviceOrdersService] inactive service product id=${serviceId}`);
    const err = new Error('service_product_inactive');
    err.code = 'service_product_inactive';
    throw err;
  }

  if (!(Number(product.price_money) > 0)) {
    logger.error(`[serviceOrdersService] invalid service price id=${serviceId} price=${product.price_money}`);
    const err = new Error('invalid_service_price');
    err.code = 'invalid_service_price';
    throw err;
  }

  return product;
}

async function listServiceCatalog() {
  const { data, error } = await supabase
    .from('service_catalog')
    .select('id, title, description, price_money, price_stars, input_schema, sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });

  if (error) {
    logger.error(`[serviceOrdersService] service catalog list failed: ${error.message}`);
    throw error;
  }

  return data || [];
}

async function insertServiceOrder({
  user,
  product,
  inputData,
  paymentId,
  payMethod,
  priceStars = null,
}) {
  const { data: order, error: orderError } = await supabase
    .from('service_orders')
    .insert({
      user_id: user.id,
      service_id: product.id,
      status: 'pending_payment',
      auth_provider: user.authProvider,
      provider_user_id: user.providerUserId,
      username: user.username,
      input_data: inputData,
      price_money: Number(product.price_money),
      price_stars: priceStars,
      pay_method: payMethod,
      payment_id: paymentId,
    })
    .select('id')
    .single();

  if (orderError || !order) {
    logger.error(`[serviceOrdersService] service order insert failed key=${user.telegram}: ${orderError?.message}`);
    throw orderError || new Error('service_order_insert_failed');
  }

  return order;
}

async function markInvoiceCreationFailed(paymentId, orderId, reason) {
  const now = new Date().toISOString();

  const { error: paymentError } = await supabase
    .from('payments')
    .update({
      status: 'failed',
      updated_at: now,
    })
    .eq('payment_id', paymentId);

  if (paymentError) {
    logger.error(`[serviceOrdersService] payment fail update after invoice error failed payment_id=${paymentId}: ${paymentError.message}`);
  }

  const { error: orderError } = await supabase
    .from('service_orders')
    .update({
      status: 'failed',
      admin_notes: reason,
      updated_at: now,
    })
    .eq('id', orderId);

  if (orderError) {
    logger.error(`[serviceOrdersService] order fail update after invoice error failed order=${orderId}: ${orderError.message}`);
  }
}

async function createYooKassaInvoice(userKey, payload) {
  const serviceId = Number(payload?.service_id);
  if (!Number.isInteger(serviceId) || serviceId <= 0) {
    logger.error(`[serviceOrdersService] service_id_required payload_service_id=${payload?.service_id}`);
    const err = new Error('service_id_required');
    err.code = 'service_id_required';
    throw err;
  }

  const email = String(payload?.email || '').trim();
  if (!email) {
    logger.error(`[serviceOrdersService] email_required service_id=${serviceId} key=${userKey}`);
    const err = new Error('email_required');
    err.code = 'email_required';
    throw err;
  }

  const payMethod = normalizePayMethod(payload?.pay_method);
  const inputData = normalizeInputData(payload?.input_data);
  const user = await getCurrentUser(userKey);
  ensureServiceOrderContact(user);
  const product = await getServiceProduct(serviceId);
  const paymentId = buildPaymentId(payMethod, serviceId, userKey);
  const order = await insertServiceOrder({
    user,
    product,
    inputData,
    paymentId,
    payMethod: toPaymentMethodCode(payMethod),
  });

  let invoice;
  try {
    invoice = await yookassaClient.createPayment({
      amountRub: Number(product.price_money),
      description: product.description || product.title,
      paymentId,
      email,
      method: toYooKassaMethod(payMethod),
      paymentSubject: 'service',
      metadata: {
        order_id: String(order.id),
        product_type: 'service_order',
        service_id: String(product.id),
      },
    });
  } catch (error) {
    logger.error(`[serviceOrdersService] yookassa create payment failed payment_id=${paymentId} order=${order.id}: ${error.message}`);
    throw error;
  }

  if (!invoice.confirmation_url) {
    logger.error(`[serviceOrdersService] yookassa confirmation url missing payment_id=${paymentId} order=${order.id}`);
    const err = new Error('yookassa_confirmation_url_missing');
    err.code = 'yookassa_confirmation_url_missing';
    throw err;
  }

  const { error: paymentError } = await supabase
    .from('payments')
    .insert({
      payment_id: paymentId,
      status: 'pending',
      description: product.description || product.title,
      telegram_id: userKey,
      crystals_give: false,
      final_price: Number(product.price_money),
      product_id: order.id,
      product_table: 'service_orders',
      pay_method: toPaymentMethodCode(payMethod),
    });

  if (paymentError) {
    logger.error(`[serviceOrdersService] payment insert failed payment_id=${paymentId}: ${paymentError.message}`);
    throw paymentError;
  }

  return {
    invoice_url: invoice.confirmation_url,
    payment_id: paymentId,
    order_id: order.id,
  };
}

async function createTelegramStarsInvoice(userKey, payload) {
  const serviceId = Number(payload?.service_id);
  if (!Number.isInteger(serviceId) || serviceId <= 0) {
    logger.error(`[serviceOrdersService] stars service_id_required payload_service_id=${payload?.service_id}`);
    const err = new Error('service_id_required');
    err.code = 'service_id_required';
    throw err;
  }

  const inputData = normalizeInputData(payload?.input_data);
  const user = await getCurrentUser(userKey);
  ensureTelegramUser(user);
  ensureServiceOrderContact(user);
  const product = await getServiceProduct(serviceId);
  const stars = Number(product.price_stars);

  if (!Number.isInteger(stars) || stars <= 0) {
    logger.error(`[serviceOrdersService] service stars price not set service_id=${serviceId} price_stars=${product.price_stars}`);
    const err = new Error('service_stars_price_not_set');
    err.code = 'service_stars_price_not_set';
    throw err;
  }

  const paymentId = buildPaymentId('stars', serviceId, userKey);
  const payMethod = toStarsPaymentMethodCode();
  const order = await insertServiceOrder({
    user,
    product,
    inputData,
    paymentId,
    payMethod,
    priceStars: stars,
  });

  const { error: paymentError } = await supabase
    .from('payments')
    .insert({
      payment_id: paymentId,
      status: 'pending',
      description: product.description || product.title,
      telegram_id: userKey,
      crystals_give: false,
      final_price: stars / 100,
      product_id: order.id,
      product_table: 'service_orders',
      pay_method: payMethod,
    });

  if (paymentError) {
    logger.error(`[serviceOrdersService] stars payment insert failed payment_id=${paymentId}: ${paymentError.message}`);
    throw paymentError;
  }

  const invoicePayload = {
    title: product.title || 'Консультация',
    description: product.description || product.title || 'Персональная консультация',
    payload: paymentId,
    currency: 'XTR',
    provider_token: '',
    prices: [{
      label: String(product.title || 'Консультация').slice(0, 32),
      amount: stars,
    }],
  };

  let invoiceUrl;
  try {
    invoiceUrl = await telegramRelayService.createInvoiceLinkViaRelay(invoicePayload);
  } catch (error) {
    logger.error(`[serviceOrdersService] relay stars invoice failed payment_id=${paymentId} order=${order.id}: ${error.message}`);
    await markInvoiceCreationFailed(paymentId, order.id, 'telegram stars invoice creation failed');
    throw error;
  }

  return {
    invoice_url: invoiceUrl,
    payment_id: paymentId,
    order_id: order.id,
  };
}

async function updateOrderInput(userKey, orderId, inputData) {
  const normalizedOrderId = Number(orderId);
  if (!Number.isInteger(normalizedOrderId) || normalizedOrderId <= 0) {
    logger.error(`[serviceOrdersService] order_id_required order_id=${orderId} key=${userKey}`);
    const err = new Error('order_id_required');
    err.code = 'order_id_required';
    throw err;
  }

  const user = await getCurrentUser(userKey);
  const normalizedInputData = normalizeInputData(inputData);

  const { data, error } = await supabase
    .from('service_orders')
    .update({
      input_data: normalizedInputData,
      updated_at: new Date().toISOString(),
    })
    .eq('id', normalizedOrderId)
    .eq('user_id', user.id)
    .select('id, status, input_data')
    .single();

  if (error || !data) {
    logger.error(`[serviceOrdersService] order input update failed order=${normalizedOrderId} key=${userKey}: ${error?.message}`);
    const err = new Error('service_order_not_found');
    err.code = 'service_order_not_found';
    throw err;
  }

  return data;
}

module.exports = {
  listServiceCatalog,
  createYooKassaInvoice,
  createTelegramStarsInvoice,
  updateOrderInput,
};
