// services/payment/telegramPaymentsService.js
const axios = require('axios');
const supabase = require('../supabaseClient');
const logger = require('../logger');
const telegramRelayService = require('./System/telegramRelayService');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// Создание инвойса через Telegram
async function createTelegramInvoice(telegramId, id, email, discountPercent = 0) {
  const { data: option, error } = await supabase
    .from('crystal_purchase_options')
    .select('crystals, price_money, description')
    .eq('id', id)
    .single();
  if (error || !option) {
    logger.error(`[createTelegramInvoice] Ошибка получения опции оплаты: ${error?.message}`);
    throw new Error('Invalid purchase option');
  }

  let price = option.price_money;

  // применяем скидку
  if (discountPercent > 0) {
    const discount = price * (discountPercent / 100);
    price = price - discount;
  }
  price = Math.round(price);

  const payload = {
    chat_id: telegramId,
    title: 'Покупка кристаллов',
    description: option.description,
    payload: `${id}_${telegramId}${Date.now()}`, // Уникальный ID операции
    provider_token: process.env.TELEGRAM_PAYMENT_TOKEN,
    currency: 'RUB',
    prices: [{
      label: `${option.crystals} кристаллов`,
      amount: Math.round(price * 100) // Telegram принимает в копейках
    }],
    //need_email: true,
    //send_email_to_provider: true,
  provider_data: {
    receipt: {
      customer: {
        email: email // ← передай с фронта
      },
      items: [{
        description: option.description,
        quantity: 1,
        amount: {
          value: option.price_money,
          currency: 'RUB',
        },
        vat_code: 1,
        payment_mode: 'full_payment',
        payment_subject: 'commodity'
      }]
    }
  }
};

  const res = await axios.post(`${TELEGRAM_API}/createInvoiceLink`, payload);
  const invoice_url = res.data.result;

    const {error: payInsertError} = await supabase
    .from('payments')
    .insert({
    payment_id: payload.payload,
    status: 'pending',
    description:option.description,
    telegram_id: telegramId,
    crystals_give: false,
    id_crystal:id,
    final_price: price
  });
  if(payInsertError) {
    logger.error(`[telegramPaymentsService, createTelegramInvoice] Ошибка сохранения платежа для telegramId=${telegramId}: ${payInsertError.message}`);
    throw payInsertError;
  } 

  const payment_id = payload.payload;
  return { invoice_url, payment_id };;
}

//Сервис для оплаты звездаи
async function createTelegramInvoiceStars(telegramId, id, discountPercent = 0) {
  const { data: option, error } = await supabase
    .from('crystal_purchase_options')
    .select('crystals, price_stars, description')
    .eq('id', id)
    .single();

  if (error || !option) {
    logger.error(`[createTelegramInvoiceStars] Ошибка получения опции: ${error?.message}`);
    throw new Error('Invalid purchase option');
  }
  if (!option.price_stars || option.price_stars <= 0) {
    logger.error(`[createTelegramInvoiceStars] Stars price is not set option=${id}`);
    throw new Error('Stars price is not set for this option');
  }

  let stars = option.price_stars;
  // скидка (если нужна) — итог должен быть целым числом stars
  if (discountPercent > 0) {
    stars = Math.round(stars - stars * (discountPercent / 100));
    if (stars < 1) stars = 1;
  }

  // payload оставляем совместимым с твоим вебхуком:
  // optionId = parseInt(payload.split('_')[0]) сработает
  const paymentId = `${id}_${telegramId}${Date.now()}`;

  const payload = {
    title: option.description,
    description: option.description,
    payload: paymentId,
    currency: 'XTR', // Stars
    provider_token: '', // для Stars пустой токен (можно и не передавать)
    prices: [{
      label: `${option.crystals} кристаллов`,
      amount: stars, // для XTR это число Stars (целое)
    }],
  };

  let invoice_url;
  try {
    invoice_url = await telegramRelayService.createInvoiceLinkViaRelay(payload);
  } catch (error) {
    logger.error(`[telegramPaymentsService, createTelegramInvoiceStars] relay create invoice failed paymentId=${paymentId}: ${error.message}`);
    throw error;
  }

  // КЛЮЧЕВО: чтобы НЕ менять WeebhookTGBot и его проверку суммы:
  // он сравнивает paidAmount с final_price*100
  // => кладём final_price = stars/100
  const { error: payInsertError } = await supabase
    .from('payments')
    .insert({
      payment_id: paymentId,
      status: 'pending',
      description: option.description,
      telegram_id: telegramId,
      crystals_give: false,
      id_crystal: id,
      final_price: stars / 100,   // <-- хак для совместимости
      pay_method: 'STARS',        // <-- единственное новое поле в payments
    });

  if (payInsertError) {
    logger.error(`[telegramPaymentsService, createTelegramInvoiceStars] Ошибка сохранения payment: ${payInsertError.message}`);
    throw payInsertError;
  }

  return { invoice_url, payment_id: paymentId };
}

//Оплата криптой
const cryptoPay = require('./System/cryptoPayService'); // путь поправь под себя

async function createTelegramInvoiceCrypto(telegramId, id) {
  const { data: option, error } = await supabase
    .from('crystal_purchase_options')
    .select('crystals, price_money, description')
    .eq('id', id)
    .single();
  if (error || !option) throw new Error('Invalid purchase option');

  const price = Math.round(option.price_money); // RUB
  const paymentId = `${id}_${telegramId}${Date.now()}`;

  await supabase.from('payments').insert({
    payment_id: paymentId,
    status: 'pending',
    description: option.description,
    telegram_id: telegramId,
    crystals_give: false,
    id_crystal: id,
    final_price: price,
    pay_method: 'CRYPTO'
  });

  const invoice = await cryptoPay.createInvoice({
    amountRub: price,
    description: option.description,
    paymentId
  });

  // invoice.mini_app_invoice_url / bot_invoice_url :contentReference[oaicite:12]{index=12}
  return { invoice_url: invoice.mini_app_invoice_url || invoice.bot_invoice_url, payment_id: paymentId };
}

async function WeebhookTGBot(payload, optionId, paidAmount) {
  // Проверяем crystal_give во избежании двойных вебхуков
  //logger.debug(`[telegramPaymentsService, WeebhookTGBot] Weebhook: Обновим кристаллы после подтверждения платежа для paymentId=${payload}`);
  const { data: payment, error: payError } = await supabase
    .from('payments')
    .select('crystals_give,id_crystal,final_price')
    .eq('payment_id', payload)
    .single();
  if (payError) {
    logger.error(`[telegramPaymentsService, WeebhookTGBot] Ошибка обращения к payments для paymentId=${payload}: ${payError.message}`);
    throw payError;
  }
  if (payment.crystals_give) {
    logger.error(`[telegramPaymentsService, WeebhookTGBot] Кристаллы уже выданы paymentId=${payload}`);
    return 'Кристаллы уже выданы для платежа';
  }

  // СРАВНИВАЕМ сумму платежа
  const {data: crystal, error: crystalError} = await supabase
    .from('crystal_purchase_options')
    .select('crystals, price_money')
    .eq('id', optionId)
    .single();
  if (crystalError) {
    logger.error(`[telegramPaymentsService, WeebhookTGBot] Ошибка поиска варианта покупки для paymentId=${payload}: ${crystalError.message}`);
    throw crystalError;
  }
  if (parseFloat(paidAmount) !== parseFloat(payment.final_price*100)) {
    logger.error(`[telegramPaymentsService, WeebhookTGBot] Несовпадение суммы платежа для paymentId=${payload}: оплачено ${payment.final_price}, ожидали ${crystal.price_money}`);
    throw new Error('Payment amount mismatch');
  }

  const { data, error } = await supabase
  .rpc('upd_crystal', {
    p_id: payload 
  });
  if(error) {
    logger.error(`[telegramPaymentsService, WeebhookTGBot] Ошибка в функции upd_crystal для paymentId=${payload}: ${error.message} `);
    throw error 
  }
}

async function WeebhookTGServiceOrder(payload, paidAmount) {
  const { data: payment, error: payError } = await supabase
    .from('payments')
    .select('payment_id, status, crystals_give, final_price, product_id, product_table, pay_method')
    .eq('payment_id', payload)
    .single();

  if (payError || !payment) {
    logger.error(`[telegramPaymentsService, WeebhookTGServiceOrder] payment lookup failed paymentId=${payload}: ${payError?.message}`);
    throw payError || new Error('payment_not_found');
  }

  if (payment.product_table !== 'service_orders') {
    logger.error(`[telegramPaymentsService, WeebhookTGServiceOrder] invalid product_table paymentId=${payload} product_table=${payment.product_table}`);
    throw new Error('invalid_service_order_payment');
  }

  const now = new Date().toISOString();

  const expectedAmount = Math.round(Number(payment.final_price) * 100);
  if (Number(paidAmount) !== expectedAmount) {
    logger.error(`[telegramPaymentsService, WeebhookTGServiceOrder] amount mismatch paymentId=${payload}: paid=${paidAmount}, expected=${expectedAmount}`);
    throw new Error('Payment amount mismatch');
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc('activate_service_order_payment', {
    p_payment_id: payload,
    p_paid_amount: Number(paidAmount),
  });

  if (!rpcError) {
    return 'Заказ активирован';
  }

  logger.error(`[telegramPaymentsService, WeebhookTGServiceOrder] activate_service_order_payment RPC failed paymentId=${payload}: ${rpcError.message}`);

  if (!(payment.status === 'succeeded' || payment.crystals_give)) {
    const { data: updatedPayment, error: paymentError } = await supabase
      .from('payments')
      .update({
        status: 'succeeded',
        crystals_give: true,
        updated_at: now,
      })
      .eq('payment_id', payload)
      .select('payment_id')
      .single();

    if (paymentError || !updatedPayment) {
      logger.error(`[telegramPaymentsService, WeebhookTGServiceOrder] payment success update failed paymentId=${payload}: ${paymentError?.message}`);
      throw paymentError || new Error('payment_success_update_failed');
    }
  }

  const { data: updatedOrder, error: orderError } = await supabase
    .from('service_orders')
    .update({
      status: 'new',
      paid_at: now,
      updated_at: now,
    })
    .eq('payment_id', payload)
    .select('id')
    .single();

  if (orderError || !updatedOrder) {
    logger.error(`[telegramPaymentsService, WeebhookTGServiceOrder] order success update failed paymentId=${payload} order=${payment.product_id}: ${orderError?.message}`);
    throw orderError || new Error('service_order_success_update_failed');
  }

  return 'Заказ активирован';
}

module.exports = {
createTelegramInvoice,
createTelegramInvoiceStars,
createTelegramInvoiceCrypto,
WeebhookTGBot,
WeebhookTGServiceOrder,
};
