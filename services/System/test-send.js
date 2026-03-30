require('dotenv').config();
const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const webAppUrl = 'https://runessheps.ru/';

// 📌 Фото лежит в папке uploads рядом с этим файлом
// Например: ./uploads/tarot.jpg
const PHOTO_PATH = path.resolve('/Users/zilya/Downloads', 'forest.jpg');


// Telegram caption limit ~ 1024
function safeCaption(html, maxLen = 1024) {
  if (!html) return '';
  if (html.length <= maxLen) return html;
  // простое обрезание + многоточие (лучше держать исходный текст <= 1024)
  return html.slice(0, maxLen - 1) + '…';
}

async function getUsers() {
  const { data, error } = await supabase
    .from('users')
    .select('telegram_real')
    .eq('telegram_real', 886443036);

  if (error) throw error;
  return data.map(u => u.telegram_real).filter(Boolean);
}

const replyMarkup = {
  inline_keyboard: [[
    { text: '🔮 Открыть приложение', web_app: { url: webAppUrl } }
  ]]
};

function buildMessage() {
  const randomEmoji = ["💜", "🌟", "✨", "🪄"];
  const e = randomEmoji[Math.floor(Math.random() * randomEmoji.length)];

  // ⚠️ Держим коротко, чтобы влезло в caption
  const html = `<b>Таро — не про “угадать будущее” 🔮</b>
Это способ понять, что с тобой происходит сейчас.

Когда сложно принять решение 🤔
когда эмоции мешают логике
когда внутри ощущение тупика —
таро помогает разложить ситуацию по полочкам 🧩

<b>Открой приложение и выбери расклад</b> ${e}`;

  return safeCaption(html, 1024);
}

async function sendBatch(users) {
  if (!fs.existsSync(PHOTO_PATH)) {
    throw new Error(`Фото не найдено: ${PHOTO_PATH}. Проверь файл в папке uploads.`);
  }

  for (const userId of users) {
    const caption = buildMessage();

    try {
      await bot.telegram.sendPhoto(
        userId,
        { source: fs.createReadStream(PHOTO_PATH) },
        {
          caption,
          parse_mode: 'HTML',
          reply_markup: replyMarkup,
        }
      );

      console.log(`✅ Отправлено: ${userId}`);
      fs.appendFileSync('send.log', `✅ ${userId}\n`);
    } catch (err) {
      if (err.parameters?.retry_after) {
        const sec = Number(err.parameters.retry_after) || 1;
        console.log(`⏸ Telegram просит подождать ${sec} секунд`);
        await new Promise(res => setTimeout(res, (sec + 1) * 1000));
      } else {
        const desc = err.description || err.message || 'unknown_error';
        console.error(`❌ Ошибка для ${userId}: ${desc}`);
        fs.appendFileSync('send.log', `❌ ${userId}: ${desc}\n`);
      }
    }

    // Пауза между сообщениями (чтобы меньше ловить флуд)
    await new Promise(res => setTimeout(res, 250));
  }
}

(async () => {
  try {
    const users = await getUsers();
    console.log(`Всего пользователей: ${users.length}`);

    // батчи по 100
    for (let i = 0; i < users.length; i += 100) {
      const batch = users.slice(i, i + 100);
      console.log(`📦 Батч ${Math.floor(i / 100) + 1} (${batch.length} пользователей)`);

      await sendBatch(batch);

      console.log('⏸ Пауза между батчами 5 секунд...');
      await new Promise(res => setTimeout(res, 5000));
    }

    console.log('🎉 Рассылка завершена!');
  } catch (err) {
    console.error('Ошибка рассылки:', err);
  }
})();
