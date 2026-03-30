const fs = require('fs');
const path = require('path');
const supabase = require('../../supabaseClient');
const logger = require('../../logger');
const axios = require('axios');
const {PRICES} = require('../../utils/constants');
const logEvent = require('../System/CJM');
const tarotRaw = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../runeLibr/tarotCards.json'), 'utf8')
);

const tarotFlatLibrary = (() => {
  const major = tarotRaw.majorArcana || [];
  const minor = tarotRaw.minorArcana || {};

  // minorArcana: { wands: [...], cups: [...], swords: [...], pentacles: [...] }
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

//Основная функция
async function createPayInterprTarot(telegramId, type, key, question) {

  const theme = 'tarot';
  const amount = PRICES.TAROT_CRYSTAL;
  const cardNames = keyToNamesArray(key);
  if (!cardNames.length) {
    return { ok: false, code: 'bad_key' };
  }

  const {data: paydata, error: chargeErr} = await supabase.rpc('tarot_pay_charge', {
    p_telegram: telegramId,
    p_type: type,
    p_amount: amount
  });
  if(chargeErr) {
    const msg = chargeErr.message || '';
    if (msg.includes('insufficient_funds_crystals')) return { ok: false, code: 'not_enough_crystals', price: amount };
    if (msg.includes('insufficient_funds_coins'))   return { ok: false, code: 'not_enough_coins',    price: amount };
    if (msg.includes('bad_currency') || msg.includes('bad_amount')) return { ok: false, code: 'bad_request' };
    return { ok: false, code: 'db_error' };
  }

  const row = Array.isArray(paydata) ? paydata[0] : paydata;
  const prem = row?.prem;
  const userId      = row?.user_id;
  const crystal_res = row?.crystal;

  const neural = await callNeural(cardNames,question,type,prem)

  if (!neural.ok) {
    // Рефандим только валюту, никаких layout_limits
    const { error: refErr } = await supabase.rpc('tarot_pay_refund', {
      p_telegram: telegramId,
      p_amount: amount
    });
    if (refErr) {
      logger.error(
        `[createPayInterprTarotService, createPayInterprTarot] Ошибка при вызове RPC tarot_pay_refund для ${telegramId}: ${refErr.message}`
      );
      throw refErr;
    }

    return { ok: false, code: 'tarot_failed' };
  }

  // Создаём сессию под этот платный расклад
  const { data: sessionRow, error: sessionErr } = await supabase
  .from('tarot_sessions')
  .insert({
    user_id:      userId,
    type,
    main_question: question,
    main_key:     key
  })
  .select('id')
  .single();

  if (sessionErr) {
    logger.error(`[createPayInterprTarotService, createPayInterprTarot] Ошибка при вставке в tarot_sessions для ${telegramId}: ${sessionErr.message}`);
    throw sessionErr;
  }

  const sessionId = sessionRow.id;
  const pay = 'crystal'
  await logEvent.logEvent(telegramId,'tarot', {pay}) //Отмечаем событие

  const cleanedDescription = neural.interpretation.trim();
  const cardsLine = `Карты в раскладе: ${cardNames.join(', ')}.`; // тут уже будут "Солнце (перевернутая)" и т.п.
  const fullDescription = `${cardsLine}\n\n${cleanedDescription}`;

  //Записываем в историю расклада
  // 6) Пишем основной платный расклад в историю (kind='main', seq=0)
  const { error: insertErr } = await supabase.rpc('tarot_insert_spread', {
    p_telegram:    telegramId,
    p_theme:       theme,
    p_type:        type,
    p_cards:       key,
    p_question:    question,
    p_description: fullDescription || null,
    p_pay:         true,
    p_session_id:  sessionId,
    p_kind:        'main',
    p_seq:         0
  });
  if (insertErr) {
    logger.error(`[createPayInterprTarotService, createPayInterprTarot] Ошибка при вызове RPC tarot_insert_spread для ${telegramId}: ${insertErr.message}`);
    throw insertErr;
  }
  
  return {
    interpretation: fullDescription,
    crystal: crystal_res,
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
  createPayInterprTarot
}
