const fs = require('fs');
const path = require('path');
const supabase = require('../../supabaseClient');
const logger = require('../../logger');
const axios = require('axios');
const logEvent = require('../System/CJM');
const { LIMITS } = require('../../utils/constants');
const tarotRaw = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../runeLibr/tarotCards.json'), 'utf8')
);
const tarotFlatLibrary = (() => {
  const major = tarotRaw.majorArcana || [];
  const minor = tarotRaw.minorArcana || {};
  const minorFlat = Object.values(minor).flat();
  return [...major, ...minorFlat];
})();

// Мапа id → русское имя
const tarotNameById = new Map();
for (const card of tarotFlatLibrary) {
  tarotNameById.set(card.id, card.name);
}

// Поиск названий карт по ключу "1,2,3" или "11,23*,5"
function keyToNamesArray(key) {
  if (!key || typeof key !== 'string') return [];

  return key
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((raw) => {
      const isReversed = raw.endsWith('*');
      const idStr = isReversed ? raw.slice(0, -1) : raw;
      const id = Number(idStr);
      if (Number.isNaN(id)) return null;

      const baseName = tarotNameById.get(id);
      if (!baseName) return null;

      // То, что пойдёт в нейронку, и то, что ты можешь отправлять фронту при желании
      return isReversed ? `${baseName} (перевернутая)` : baseName;
    })
    .filter(Boolean);
}

// Утилита: получаем user_id + флаг премиума
async function getUserWithPremFlag(telegramId) {
  const { data: user, error } = await supabase
    .from('users')
    .select('id, subscribe(sub_id)')
    .eq('telegram', telegramId)
    .single();

  if (error || !user) {
    logger.error(
      `[tarotService, getUserWithPremFlag] Ошибка при обращении к users для ${telegramId}: ${error?.message}`
    );
    throw error || new Error('user_not_found');
  }

  return {
    userId: user.id,
    prem: !!user.subscribe?.sub_id
  };
}

// Основная функция: бесплатная интерпретация основного расклада
async function createInterprTarot(telegramId, type, key, question) {
  const theme = 'tarot'; // можешь заменить на свою схему

  const cardNames = keyToNamesArray(key);
  if (!cardNames.length) {
    throw new Error('Некорректный ключ расклада таро');
  }

  // 1. user_id + прем
  const { userId, prem } = await getUserWithPremFlag(telegramId);

  // 2. Нейронка
  const neural = await callNeural(cardNames, question, type, prem);

  if (!neural.ok) {
    return { ok: false, code: 'tarot_failed' };
  }

  // 3. Создаём сессию (одна сессия = основной расклад + до 2 продолжений)
  const { data: sessionRows, error: sessionErr } = await supabase
    .from('tarot_sessions')
    .insert({
      user_id: userId,
      type,
      main_question: question,
      main_key: key
    })
    .select('id')
    .single();

  if (sessionErr) {
    logger.error(
      `[createInterprTarotService, createInterprTarot] Ошибка при вставке в tarot_sessions для ${telegramId}: ${sessionErr.message}`
    );
    throw sessionErr;
  }

  const sessionId = sessionRows.id;

  const cleanedDescription = neural.interpretation.trim();
  const cardsLine = `Карты в раскладе: ${cardNames.join(', ')}.`; // тут уже будут "Солнце (перевернутая)" и т.п.
  const fullDescription = `${cardsLine}\n\n${cleanedDescription}`;

  // 6. Записываем основной расклад в историю (kind = 'main', seq = 0)
  const { error: insertErr } = await supabase.rpc('tarot_insert_spread', {
    p_telegram: telegramId,
    p_theme: theme,
    p_type: type,
    p_cards: key,
    p_question: question,
    p_description: fullDescription || null,
    p_pay: false,
    p_session_id: sessionId,
    p_kind: 'main',
    p_seq: 0
  });
  if (insertErr) {
    logger.error(
      `[createInterprTarotService, createInterprTarot] Ошибка при вызове RPC tarot_insert_spread для ${telegramId}: ${insertErr.message}`
    );
    throw insertErr;
  }

  const { error: limitError } = await supabase.rpc('consume_layout_limit', {
    p_telegram: telegramId,
    p_theme: 'tarot',
    p_type: type,
    p_window_hours: LIMITS.TAROT_MAIN_WINDOW_HOURS
  });
  if (limitError) {
    logger.error(
      `[createInterprTarotService, createInterprTarot] Ошибка при вызове RPC consume_layout_limit для ${telegramId}: ${limitError.message}`
    );
    throw limitError;
  }

  // Можно логировать CJM
  
  await logEvent.logEvent(telegramId,'tarot', {"pay": "free"}) //Отмечаем событие

  return {
    interpretation: fullDescription,
    session_id: sessionId
  };
}

const FORBIDDEN_CHARS_REGEX = /[A-Za-z\u4E00-\u9FFF]/;
const MAX_ATTEMPTS = 2;

function isValidNeuralText(text) {
  if (typeof text !== 'string') return false;

  // Нет латиницы / китайских символов
  if (FORBIDDEN_CHARS_REGEX.test(text)) return false;

  return true;
}

async function callNeural(сards, question, spreadType, premium) {

  const payload = {
    tarot: сards,                    // Массив карт: ["Маг", "Императрица", "Звезда"]
    question: question,               // Вопрос пользователя
    type: spreadType,                 // "classic" | "pyramid" | "cross"
    premium: premium,                 // true | false
    model: 'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8',
  };

  for (let attempt = 0; attempt <= MAX_ATTEMPTS; attempt++) {
    const data = await axios.post('http://localhost:8080/api/v1/tarot/interpret', payload);

    let text = data?.data.interpretation;

    if (!data || typeof text !== 'string' || text.trim().length < 20) {
      return { ok: false, error: 'invalid_response' };
    }

    if (isValidNeuralText(text)) {
      return {
        ok: true,
        interpretation: text.trim(),
      };
    }

  }

  return { ok: false, error: 'invalid_s_response' };
}

module.exports = {
  createInterprTarot
};
