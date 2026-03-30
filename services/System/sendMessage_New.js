// scripts/broadcast.js
require('dotenv').config();
const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const { SENDLIMITS } = require('../../utils/constants');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const webAppUrl = 'https://runessheps.ru/';

// Сколько дней должно пройти с последней отправки
const INTERVAL_DAYS = Number(SENDLIMITS.BROADCAST_INTERVAL_DAYS|| 2);

// Небольшое разнообразие эмодзи (опционально; это не «антиспам», просто косметика)
const EMOJI = ["💌","🌟","✨","🪄","🔮","🧿","🌀","💜","⚡️","🔥"];
const pickEmoji = () => EMOJI[Math.floor(Math.random()*EMOJI.length)];

//Определяем подходящий шаблон
async function getNextTemplate() {
  const { data, error } = await supabase.rpc('get_next_template');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('Нет включённых шаблонов');
  return data[0]; // { id, title, body_html }
}

//Определяем юзеров для рассылки
async function getRecipients(days) {
  const { data, error } = await supabase.rpc('get_broadcast_recipients', { p_days: days });
  if (error) throw error;
  return data; // [{ user_id, telegram_real }]
}

//Отмечаем выбранный шаблон как использованный
async function markTemplateSent(templateId) {
  const { error } = await supabase.rpc('mark_template_sent', { p_template_id: templateId });
  if (error) throw error;
}

async function markUserSent(userId) {
  const { error } = await supabase
    .from('users')
    .update({ last_broadcast_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) throw error;
}

(async () => {
  try {
    const template = await getNextTemplate();
    const recipients = await getRecipients(INTERVAL_DAYS);

    console.log(`Шаблон: ${template.title} (id=${template.id}); получателей: ${recipients.length}`);

      // вариант 1: web_app-кнопка
    const replyMarkup = {
      inline_keyboard: [[
        { text: '🔮 Открыть приложение', web_app: { url: webAppUrl } }
      ]]
    };

    // вариант 2: диплинк (если хотим параметр старта)
    // const link = `https://t.me/${process.env.BOT_USERNAME}?startapp=from_broadcast`;
    // const replyMarkup = { inline_keyboard: [[ { text: '🔮 Открыть приложение', url: link } ]] };

    // Пошли слать
    for (const u of recipients) {
      const text = template.body_html.replaceAll('${EMOJI}', pickEmoji()); //Ставим рандомный эмодзи (обходим антиспам, хотя не уверен, что нужно)

      try {
        await bot.telegram.sendMessage(u.telegram_real, text, {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: replyMarkup,                    
        });
        await markUserSent(u.user_id);
        console.log(`✅ ${u.telegram_real}`);
      } catch (err) {
        if (err.parameters?.retry_after) {
          const wait = (err.parameters.retry_after + 1) * 1000;
          console.log(`⏸ wait ${wait}ms`);
          await new Promise(r => setTimeout(r, wait));
          // 2-я попытка
          try {
            await bot.telegram.sendMessage(u.telegram_real, text, {
              parse_mode: 'HTML',
              disable_web_page_preview: true,
              reply_markup: replyMarkup,                 
            });
            await markUserSent(u.user_id);
            console.log(`✅ ${u.telegram_real} (после паузы)`);
          } catch (e2) {
            console.error(`❌ ${u.telegram_real}: ${e2.description}`);
            // Пользователь мог заблокировать бота — просто идём дальше.
          }
        } else {
          console.error(`❌ ${u.telegram_real}: ${err.description}`);
          // Заблокировал? ок, просто пропускаем. Без флага — будем пытаться снова в следующую рассылку.
        }
      }

      // антифлуд — держим 5 msg/sec
      await new Promise(r => setTimeout(r, 200));
    }

    // Зафиксируем, какой шаблон использовали
    await markTemplateSent(template.id);

    console.log('🎉 Рассылка завершена');
    process.exit(0);
  } catch (e) {
    console.error('Broadcast error:', e);
    process.exit(1);
  }
})();
