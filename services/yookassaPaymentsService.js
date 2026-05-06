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
    const err = new Error('email_required');
    err.code = 'email_required';
    throw err;
  }

  const option = await getCrystalOption(id);
  const amountRub = Number(option.price_money);

  if (!(amountRub > 0)) {
    const err = new Error('invalid_purchase_price');
    err.code = 'invalid_purchase_price';
    throw err;
  }

  const paymentId = buildPaymentId(method === YOOKASSA_METHOD_CARD ? 'card' : 'ym', id, userKey);
  const invoice = await yookassaClient.createPayment({
    amountRub,
    description: option.description,
    paymentId,
    email: email.trim(),
    method,
  });

  if (!invoice.confirmation_url) {
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

async function handleWebhook(update) {
  const event = String(update?.event || update?.type || '').trim().toLowerCase();
  const providerPaymentId = String(update?.object?.id || '').trim();

  if (!event || !providerPaymentId) {
    return false;
  }

  const verified = await yookassaClient.getPayment(providerPaymentId);
  const internalPaymentId = String(
    verified?.metadata?.payment_id || update?.object?.metadata?.payment_id || ''
  ).trim();

  if (!internalPaymentId) {
    return false;
  }

  const { data: payment, error } = await supabase
    .from('payments')
    .select('payment_id, status, crystals_give')
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

    await markPaymentSucceeded(payment.payment_id);
    return true;
  }

  if (event === 'payment.canceled' || event === 'payment.cancelled') {
    await markPaymentFailed(payment.payment_id);
    return true;
  }

  return false;
}

module.exports = {
  createCardInvoice: (userKey, id, email) => createInvoice(userKey, id, email, YOOKASSA_METHOD_CARD),
  createYooMoneyInvoice: (userKey, id, email) => createInvoice(userKey, id, email, YOOKASSA_METHOD_YOOMONEY),
  handleWebhook,
};
