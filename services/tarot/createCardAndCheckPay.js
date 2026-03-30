const fs = require('fs');
const path = require('path');
const supabase = require('../../supabaseClient');
const logger = require('../../logger');
const { LIMITS, PRICES } = require('../../utils/constants');

// Библиотека с картами Таро
const tarotRaw = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../runeLibr/tarotCards.json'), 'utf8')
);

// Делаем плоский массив всех карт (старший + младший аркан)
const tarotFlatLibrary = (() => {
  const major = tarotRaw.majorArcana || [];

  const minor = tarotRaw.minorArcana || {};
  // minorArcana: { wands: [...], cups: [...], swords: [...], pentacles: [...] }
  const minorFlat = Object.values(minor).flat(); // объединяем все масти в один массив

  return [...major, ...minorFlat];
})();

// Количество карт для разных типов раскладов
const typeCounts = {
  cross: 4, //226
  road: 5, //233
  railstat: 7 //554
};

const MAX_REVERSED_PER_SPREAD = 3; // максимум 3 перевёрнутых карты на один расклад

// Генерируем карты и определяем, нужно ли платить
async function getCardTarotAndCheckPay(telegramId, type) {
  // 1. Проверяем тип расклада
  const count = typeCounts[type];
  if (!count) {
    logger.error(
      `[createCardAndCheckPay, getCardTarotAndCheckPay] Неверный тип расклада type=${type} для telegramId=${telegramId}`
    );
    throw new Error('Неверный тип расклада');
  }

  // 2. Выбираем карты (уникальные по id)
  const allTarot = [...tarotFlatLibrary];
  const usedIds = new Set();
  const shuffled = allTarot.sort(() => Math.random() - 0.5);

  const keyParts = []; // сюда кладём "id" или "id*"
  let reversedCount = 0; // сколько перевёрнутых уже выбрали

  for (const card of shuffled) {
    if (usedIds.has(card.id)) continue;
    usedIds.add(card.id);

    let isReversed = false;

    // Пока не набрали 3 перевёрнутых — кидаем монетку 50/50
    if (reversedCount < MAX_REVERSED_PER_SPREAD) {
      isReversed = Math.random() < 0.5;
    } else {
      // Лимит перевёрнутых достигнут — дальше только прямые
      isReversed = false;
    }

    if (isReversed) {
      reversedCount += 1;
    }

    const keyPart = isReversed ? `${card.id}*` : `${card.id}`;
    keyParts.push(keyPart);

    if (keyParts.length >= count) break;
  }

  const tarotKey = keyParts.join(',');

  // 3. Определяем, нужно ли платить — по дневному лимиту основных раскладов
  const limit_base = LIMITS.TAROT_MAIN_BASE_PER_DAY;
  const limit_prem = LIMITS.TAROT_MAIN_PREM_PER_DAY;
  const windowHours = LIMITS.TAROT_MAIN_WINDOW_HOURS;

  const { data, error } = await supabase.rpc('get_layout_limit_status', {
    p_telegram: telegramId,
    p_theme: 'tarot',
    p_type: type,
    p_base_limit: limit_base,
    p_premium_limit: limit_prem,
    p_window_hours: windowHours
  });

  if (error) {
    logger.error(
      `[createCardAndCheckPay, getCardTarotAndCheckPay] Ошибка при вызове RPC get_layout_limit_status для ${telegramId}: ${error.message}`
    );
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;

  const attemptsLeft = row?.quota_left != null ? Number(row.quota_left) : 0;
  const needPayment = attemptsLeft <= 0;

  const crystal = PRICES.TAROT_CRYSTAL;

  return {
    need_payment: needPayment,
    key: tarotKey,
    crystal
  };
}

module.exports = {
  getCardTarotAndCheckPay
};
