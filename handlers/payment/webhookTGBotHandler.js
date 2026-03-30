//TODO Хэндлер для обработки вебхука
// handlers/payment/webhookHandler.js
require('dotenv').config();
const axios = require('axios');
const logger = require('../../logger');
const supabase = require('../../supabaseClient');
const createTGInvoice = require('../../services/telegramPaymentsService');
//const createStaffInvoice = require('../../services/stav/stavPaymentService');
const webAppUrl = 'https://runessheps.ru/';

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

async function answerPreCheckoutQuery(queryId, ok = true) {
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/answerPreCheckoutQuery`, {
      pre_checkout_query_id: queryId,
      ok
    });
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
      //logger.info('[Webhook] Новый апдейт:\n' + JSON.stringify(update, null, 2));
      
      // Обработка pre_checkout_query
      if (update.pre_checkout_query) {
        await answerPreCheckoutQuery(update.pre_checkout_query.id, true);

        return res.sendStatus(200);; // завершаем хук
      }

      if (update.message?.successful_payment) {
        const payment = update.message.successful_payment;
        //const telegramId = update.message.from.id;
        const payload = payment.invoice_payload; 
        //console.log("🚀 ~ handleWebhook: ~ payload:", payload)
        const optionId = parseInt(payload.split('_')[0]);
        //console.log("🚀 ~ handleWebhook: ~ optionId:", optionId)
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
          .single();
        
        if (payRowErr) {
          logger.error(`[webhookTGBotHandler] Не нашли payments по payment_id=${payload}: ${payRowErr.message}`);
          return res.sendStatus(200);
        }

        const productTable = payRow?.product_table;
        //*СТАФ
        if (productTable === 'staf_requests') {
          await createStaffInvoice.WeebhookTGBotStaf(payload, paidAmount);
          return res.sendStatus(200);
        }
        //console.log("✅ Успешный платеж:");
        //console.log("payload:", payload);
        //Обновление succeeded происходит в транзакции, вызываемой в функции далее
        //logger.info(`[webhookTGBotHandler, handleWebhook] Webhook: обновляем кристаллы после успешного платежа для paymentId = ${payload}`);
        const webhook =  await createTGInvoice.WeebhookTGBot(payload, optionId, paidAmount);
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
        
        await bot.sendMessage(chatId,
          
          `🛡 Добро пожаловать в ShepsRunes!\n\n` +
          `🔮 Рунические расклады с Олегом Шепсом прямо в Telegram\n` +
          `✨ Погрузитесь в мир магии`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔮 Открыть приложение',web_app: { url: webAppUrl } }],
                [{ text: '🕯 Поддержка', url: 'https://t.me/m/aJl8c0izMzUy' }]
              ]
            }
          }
        );

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
