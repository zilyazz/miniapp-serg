const supabase = require('../supabaseClient');
const logger = require('../logger');
const yookassaClient = require('./System/yookassaService');

const YOOKASSA_METHOD_CARD = 'bank_card';
const YOOKASSA_METHOD_YOOMONEY = 'yoo_money';

function buildPaymentId(prefix, optionId, userKey) {
  const safeUserKey = String(userKey || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12) || 'user';
  return `yk_${prefix}_${optionId}_${Date.now()}_${safeUserKey}`;
}

function getPayMethodCode(method) {
  if (method === YOOKASSA_METHOD_CARD) {
    return 'YOOKASSA_CARD';
  }
  if (method === YOOKASSA_METHOD_YOOMONEY) {
    return 'YOOKASSA_YOOMONEY';
  }

  return 'YOOKASSA';
}

async function getCrystalOption(id) {
  const { data: option, error } = await supabase
    .from('crystal_purchase_options')
    .select('id, crystals, price_money, description')
    .eq('id', id)
    .single();

  if (error || !option) {
    logger.error(`[yookassaPaymentsService] crystal option lookup failed id=${id}: ${error?.message}`);
    const err = new Error('Invalid purchase option');
    err.code = 'invalid_purchase_option';
    throw err;
  }

  return option;
}

async function createInvoice(userKey, id, email, method) {
  if (!email || typeof email !== 'string' || !email.trim()) {
    logger.error(`[yookassaPaymentsService] email_required key=${userKey} option=${id}`);
    const err = new Error('email_required');
    err.code = 'email_required';
    throw err;
  }

  const option = await getCrystalOption(id);
  const amountRub = Number(option.price_money);

  if (!(amountRub > 0)) {
    logger.error(`[yookassaPaymentsService] invalid purchase price option=${id} price=${option.price_money}`);
    const err = new Error('invalid_purchase_price');
    err.code = 'invalid_purchase_price';
    throw err;
  }

  const paymentId = buildPaymentId(method === YOOKASSA_METHOD_CARD ? 'card' : 'ym', id, userKey);
  let invoice;
  try {
    invoice = await yookassaClient.createPayment({
      amountRub,
      description: option.description,
      paymentId,
      email: email.trim(),
      method,
    });
  } catch (error) {
    logger.error(`[yookassaPaymentsService] yookassa create payment failed payment_id=${paymentId}: ${error.message}`);
    throw error;
  }

  if (!invoice.confirmation_url) {
    logger.error(`[yookassaPaymentsService] yookassa confirmation url missing payment_id=${paymentId}`);
    const err = new Error('yookassa_confirmation_url_missing');
    err.code = 'yookassa_confirmation_url_missing';
    throw err;
  }

  const { error: payInsertError } = await supabase
    .from('payments')
    .insert({
      payment_id: paymentId,
      status: 'pending',
      description: option.description,
      telegram_id: userKey,
      crystals_give: false,
      id_crystal: id,
      final_price: amountRub,
      pay_method: getPayMethodCode(method),
    });

  if (payInsertError) {
    logger.error(`[yookassaPaymentsService] payment insert failed key=${userKey} option=${id}: ${payInsertError.message}`);
    throw payInsertError;
  }

  return {
    invoice_url: invoice.confirmation_url,
    payment_id: paymentId,
  };
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
    logger.error(`[yookassaPaymentsService] mark failed payment_id=${paymentId}: ${error.message}`);
    throw error;
  }
}

async function markPaymentSucceeded(paymentId) {
  const { error } = await supabase.rpc('upd_crystal', {
    p_id: paymentId,
  });

  if (error) {
    logger.error(`[yookassaPaymentsService] upd_crystal failed payment_id=${paymentId}: ${error.message}`);
    throw error;
  }
}

async function markServiceOrderFailed(payment) {
  const now = new Date().toISOString();

  const { error: payError } = await supabase
    .from('payments')
    .update({
      status: 'failed',
      updated_at: now,
    })
    .eq('payment_id', payment.payment_id);

  if (payError) {
    logger.error(`[yookassaPaymentsService] service payment fail update failed payment_id=${payment.payment_id}: ${payError.message}`);
    throw payError;
  }

  const { error: orderError } = await supabase
    .from('service_orders')
    .update({
      status: 'failed',
      admin_notes: 'payment failed',
      updated_at: now,
    })
    .eq('id', payment.product_id);

  if (orderError) {
    logger.error(`[yookassaPaymentsService] service order fail update failed order=${payment.product_id}: ${orderError.message}`);
    throw orderError;
  }
}

async function markServiceOrderSucceeded(payment) {
  const now = new Date().toISOString();

  const { error: payError } = await supabase
    .from('payments')
    .update({
      status: 'succeeded',
      crystals_give: true,
      updated_at: now,
    })
    .eq('payment_id', payment.payment_id);

  if (payError) {
    logger.error(`[yookassaPaymentsService] service payment success update failed payment_id=${payment.payment_id}: ${payError.message}`);
    throw payError;
  }

  const { error: orderError } = await supabase
    .from('service_orders')
    .update({
      status: 'new',
      paid_at: now,
      updated_at: now,
    })
    .eq('id', payment.product_id);

  if (orderError) {
    logger.error(`[yookassaPaymentsService] service order success update failed order=${payment.product_id}: ${orderError.message}`);
    throw orderError;
  }
}

async function handleWebhook(update) {
  const event = String(update?.event || update?.type || '').trim().toLowerCase();
  const providerPaymentId = String(update?.object?.id || '').trim();

  if (!event || !providerPaymentId) {
    logger.error(`[yookassaPaymentsService] malformed webhook event=${event} provider_payment_id=${providerPaymentId}`);
    return false;
  }

  let verified;
  try {
    verified = await yookassaClient.getPayment(providerPaymentId);
  } catch (error) {
    logger.error(`[yookassaPaymentsService] yookassa verify webhook failed provider_payment_id=${providerPaymentId}: ${error.message}`);
    throw error;
  }

  const internalPaymentId = String(
    verified?.metadata?.payment_id || update?.object?.metadata?.payment_id || ''
  ).trim();

  if (!internalPaymentId) {
    logger.error(`[yookassaPaymentsService] webhook payment_id missing provider_payment_id=${providerPaymentId} event=${event}`);
    return false;
  }

  const { data: payment, error } = await supabase
    .from('payments')
    .select('payment_id, status, crystals_give, product_id, product_table')
    .eq('payment_id', internalPaymentId)
    .single();

  if (error || !payment) {
    logger.error(`[yookassaPaymentsService] payment lookup failed payment_id=${internalPaymentId}: ${error?.message}`);
    return false;
  }

  if (event === 'payment.succeeded') {
    if (payment.status === 'succeeded' || payment.crystals_give) {
      return true;
    }

    if (payment.product_table === 'service_orders') {
      await markServiceOrderSucceeded(payment);
      return true;
    }

    await markPaymentSucceeded(payment.payment_id);
    return true;
  }

  if (event === 'payment.canceled' || event === 'payment.cancelled') {
    if (payment.product_table === 'service_orders') {
      await markServiceOrderFailed(payment);
      return true;
    }

    await markPaymentFailed(payment.payment_id);
    return true;
  }

  logger.error(`[yookassaPaymentsService] unsupported webhook event=${event} payment_id=${internalPaymentId}`);
  return false;
}

module.exports = {
  createCardInvoice: (userKey, id, email) => createInvoice(userKey, id, email, YOOKASSA_METHOD_CARD),
  createYooMoneyInvoice: (userKey, id, email) => createInvoice(userKey, id, email, YOOKASSA_METHOD_YOOMONEY),
  handleWebhook,
};
