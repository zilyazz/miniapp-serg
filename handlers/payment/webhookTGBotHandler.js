//TODO Хэндлер для обработки вебхука
// handlers/payment/webhookHandler.js
require('dotenv').config();
const logger = require('../../logger');
const supabase = require('../../supabaseClient');
const createTGInvoice = require('../../services/telegramPaymentsService');
const telegramRelayService = require('../../services/System/telegramRelayService');
const { WEB_APP_URL } = require('../../utils/constants');
//const createStaffInvoice = require('../../services/stav/stavPaymentService');

async function isServiceOrderPayment(paymentId) {
  const { data, error } = await supabase
    .from('service_orders')
    .select('id')
    .eq('payment_id', paymentId)
    .maybeSingle();

  if (error) {
    logger.error(`[webhookTGBotHandler] service_orders lookup failed payment_id=${paymentId}: ${error.message}`);
    return false;
  }

  return Boolean(data?.id);
}

async function answerPreCheckoutQuery(queryId, ok = true) {
  try {
    if (!telegramRelayService.isTelegramRelayConfigured()) {
      logger.error(`[Webhook] Telegram relay is not configured for pre_checkout_query=${queryId}`);
      return;
    }

    await telegramRelayService.answerPreCheckoutViaRelay(queryId, ok);
    //console.log(`[Webhook] ✅ Ответили на pre_checkout_query: ${queryId}`);
  } catch (error) {
    logger.error(`[Webhook] ❌ Ошибка при answerPreCheckoutQuery: ${error.message}`);
  }
}

async function saveUserSource(userId, source) {
  if (!source) return;

  const { error } = await supabase.rpc('save_tg_source', {
    p_telegram: userId,       // bigint
    p_source: source,         // text
  });

  if (error) {
    logger.error(
      `[webhookTGBotHandler, saveUserSource] RPC save_tg_source error telegram=${userId}, source=${source}: ${error.message}`
    );
  }
}

module.exports = {
  handleWebhook: async (req, res, bot) => {
    //console.log("🚀 ~ req:", req.body)
    //res.sendStatus(200) //!Убрал так кнопки ругаются, лучше в разных местах ставить
    try {
      const update = req.body;
      
      // Обработка pre_checkout_query
      if (update.pre_checkout_query) {
        await answerPreCheckoutQuery(update.pre_checkout_query.id, true);

        return res.sendStatus(200);; // завершаем хук
      }

      if (update.message?.successful_payment) {
        const payment = update.message.successful_payment;
        //const telegramId = update.message.from.id;
        const payload = payment.invoice_payload; 
        const paidAmount = payment.total_amount;
        //console.log("🚀 ~ receipt_registration:", payment.receipt_registration)
        //console.log("🚀 ~ receipt_registration:",  payment.order_info.email)
        //console.log("🚀 ~ handleWebhook: ~ paidAmount:", paidAmount)
        //const tgChargeId = payment.telegram_payment_charge_id;
        //const providerChargeId = payment.provider_payment_charge_id;
          // ✅ пытаемся понять, что за товар, через payments.product_table / table_product
        const { data: payRow, error: payRowErr } = await supabase
          .from('payments')
          .select('product_table')
          .eq('payment_id', payload)
          .maybeSingle();
        
        if (payRowErr) {
          logger.error(`[webhookTGBotHandler] payments lookup failed payment_id=${payload}: ${payRowErr.message}`);
        }

        const productTable = payRow?.product_table;
        const serviceOrderPayment = productTable === 'service_orders' || await isServiceOrderPayment(payload);
        //*СТАФ
        if (productTable === 'staf_requests') {
          await createStaffInvoice.WeebhookTGBotStaf(payload, paidAmount);
          return res.sendStatus(200);
        }

        if (serviceOrderPayment) {
          await createTGInvoice.WeebhookTGServiceOrder(payload, paidAmount);
          return res.sendStatus(200);
        }
        //console.log("✅ Успешный платеж:");
        //console.log("payload:", payload);
        //Обновление succeeded происходит в транзакции, вызываемой в функции далее
        //logger.info(`[webhookTGBotHandler, handleWebhook] Webhook: обновляем кристаллы после успешного платежа для paymentId = ${payload}`);
        const optionId = parseInt(payload.split('_')[0]);
        await createTGInvoice.WeebhookTGBot(payload, optionId, paidAmount);
        //logger.info(`[webhookTGBotHandler, handleWebhook] Платёж ${payload} успешно завершён, кристаллы обновленны`);
        return res.sendStatus(200);
      } 
      // ========== 3. Команда /start ==========
      if (update.message &&
          typeof update.message.text === 'string' &&
          update.message.text.startsWith('/start') ) {
          const chatId = update.message.chat.id;

        const userId = update.message.from.id;
        //console.log("🚀 ~ userId:", userId)
        const text = update.message.text;
        //console.log("🚀 ~ text:", text)
        const parts = text.split(' ');
        //console.log("🚀 ~ parts:", parts)
        const source = parts[1] || null; 
        //console.log("🚀 ~ source:", source)
        
        await saveUserSource(userId, source);
        
        const textMessage =
          `🌙 Добро пожаловать в пространство Сияны!\n\n` +
          `🔮 Вся астрология в одном клике в Телеграмм.\n` +
          `🔥 Личные консультации, расклады таро, прогнозы совместимости ждут тебя!`;

        const replyMarkup = {
          inline_keyboard: [
            [{ text: '💫 Открыть приложение', web_app: { url: WEB_APP_URL } }],
          ],
        };

        if (telegramRelayService.isTelegramRelayConfigured()) {
          await telegramRelayService.sendMessageViaRelay({
            chatId,
            text: textMessage,
            replyMarkup,
          });
        } else {
          await bot.sendMessage(chatId, textMessage, {
            reply_markup: replyMarkup,
          });
        }

        res.sendStatus(200);
        return;
      }
/*
      // ========== 5. Остальные команды ==========
      if (update.message && update.message.text === '/help') {
        const chatId = update.message.chat.id;
        await bot.sendMessage(chatId,
          `📋 Команды:\n/start – меню\n/help – справка\n/info – информация`
        );
        res.sendStatus(200);
        return;
      }
*/    
      return  res.sendStatus(200)
      //console.log("КТО ТО СТУЧИТСЯ");
      //res.sendStatus(200);
    } catch (error) {
        const status = error.response?.status;
        const description = error.response?.data?.description;
      if (status === 403 && description?.includes('bot was blocked by the user')) {
        logger.debug(`[WebhookHandler] Пользователь заблокировал бота или не начинал диалог.`);
        res.sendStatus(200); // всё ок, Telegram не будет переотправлять
      } else {
        logger.error(`[WebhookTGBotHandler] Ошибка: ${error.message}`);
        res.status(500).send('Webhook error');
      }
    } 
  } 
};
