// services/horoscope/luckyDayService.js
const supabase = require('../../supabaseClient');
const logger = require('../../logger');
const axios = require('axios');
const logEvent = require('../System/CJM');
const { HOROSCOPE,PRICES } = require('../../utils/constants');

async function getAllowedTags() {
  const { data, error } = await supabase
    .from('horoscope_tag_dict')
    .select('key_en')
    .eq('is_enabled', true);

  if (error) throw error;
  return (data || []).map(r => r.key_en);
}

async function getAllowedScoreKeys() {
  const { data, error } = await supabase
    .from('horoscope_param_dict')
    .select('key_en')
    .eq('is_enabled', true);

  if (error) throw error;
  return (data || []).map(r => r.key_en);
}

//Проверка на латиницу / китайские символы
const LETTER_RE = /\p{L}/u;
const CYRILLIC_RE = /\p{Script=Cyrillic}/u;

function containsNonCyrillicLetters(text) {
  if (typeof text !== 'string') return false;
  for (const ch of text) {
    if (LETTER_RE.test(ch) && !CYRILLIC_RE.test(ch)) return true;
  }
  return false;
}

//Обработка ответа от нейронки
function validateNeuralLucky(resp, allowedTagsSet, allowedScoreKeysSet) {
  if (!resp || typeof resp !== 'object') throw new Error('invalid_neural_response');

  // 1) если нейронка вернёт какие-то ru-поля текстом — сразу режем не-кириллицу
  for (const [k, v] of Object.entries(resp)) {
    if (typeof v === 'string') {
      if (containsNonCyrillicLetters(v)) throw new Error(`forbidden_chars_in_${k}`);
    }
  }

  const { intent_tags, avoid_tags, weights_scores, best_text_ru } = resp;

  if (typeof best_text_ru !== 'string' || best_text_ru.trim().length < 40) {
    throw new Error('invalid_best_text_ru');
  }
  if (containsNonCyrillicLetters(best_text_ru)) {
    throw new Error('forbidden_chars_in_best_text_ru');
  }

  if (!Array.isArray(intent_tags) || !Array.isArray(avoid_tags)) {
    throw new Error('invalid_tags_arrays');
  }
  if (!weights_scores || typeof weights_scores !== 'object' || Array.isArray(weights_scores)) {
    throw new Error('invalid_weights_scores');
  }

  for (const t of [...intent_tags, ...avoid_tags]) {
    if (typeof t !== 'string') throw new Error('invalid_tag_item');
    const tag = t.trim();
    if (!allowedTagsSet.has(tag)) throw new Error(`invalid_tag_value:${tag}`);
  }

  for (const [k, v] of Object.entries(weights_scores)) {
    if (!allowedScoreKeysSet.has(k)) throw new Error(`invalid_weight_key:${k}`);
    if (typeof v !== 'number' || Number.isNaN(v)) throw new Error(`invalid_weight_value:${k}`);
    if (v < -1 || v > 1) throw new Error(`weight_out_of_range:${k}`);
  }
}


//Общая процы вызова нейронки
async function callLuckyNeuralWithRetry(payload, allowedTagsSet, allowedScoreKeysSet) {
  let lastErr;
  
  for (let attempt = 0; attempt <= HOROSCOPE.LUCKY_MAX_ATTEMPTS; attempt++) {
    try {
      const { data } = await axios.post(HOROSCOPE.LUCKY_NEURAL_URL, {
        payload,
        model: 'Qwen/Qwen3-Next-80B-A3B-Instruct'
      });
      //console.log("🚀 ~ callLuckyNeuralWithRetry ~ data:", data)

      validateNeuralLucky(data, allowedTagsSet, allowedScoreKeysSet);
      return data;
    } catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, 250 + Math.random() * 400));
    }
  }

  throw lastErr;
}

async function refundLuckyDay(telegramId) {
  const amount = PRICES.HOROSCOPE_LUCKYDAY_CRYSTAL;

  try {
    await supabase.rpc('horoscope_lucky_pay_refund', {
      p_telegram: telegramId,
      p_amount: amount
    });
  } catch (e) {
    logger.error(`[luckyDayService, refundLuckyDay] refund failed telegram=${telegramId}: ${e.message}`);
  }
}

function scoreDay(dayParams, dayTags, neural) {
  const weights = neural.weights_scores || {};
  let scoreNumbers = 0;

  for (const [k, w] of Object.entries(weights)) {
    const v = Number(dayParams?.[k] ?? 0);
    scoreNumbers += v * w;
  }

  const intentSet = new Set((neural.intent_tags || []).map(s => s.trim()));
  const avoidSet  = new Set((neural.avoid_tags || []).map(s => s.trim()));

  let intentMatch = 0;
  let avoidMatch = 0;

  for (const t of (dayTags || [])) {
    if (intentSet.has(t)) intentMatch++;
    if (avoidSet.has(t)) avoidMatch++;
  }

  const scoreTags = HOROSCOPE.LUCKY_TAG_BONUS * intentMatch - HOROSCOPE.LUCKY_TAG_PENALTY * avoidMatch;
  const finalScore = scoreNumbers + scoreTags;

  return { finalScore, scoreNumbers, scoreTags, intentMatch, avoidMatch };
}

//Оплата
async function chargeLuckyDay(telegramId) {

  const amount = PRICES.HOROSCOPE_LUCKYDAY_CRYSTAL;

  const { data, error: chargeErr } = await supabase.rpc('horoscope_lucky_pay_charge', {
    p_telegram: telegramId,
    p_amount: amount
  });
  if (chargeErr) {
    const msg = chargeErr.message || '';
    if (msg.includes('insufficient_funds_crystals')) return { ok: false, code: 'not_enough_crystals', price: amount };
    if (msg.includes('insufficient_funds_coins'))   return { ok: false, code: 'not_enough_coins',    price: amount };
    if (msg.includes('bad_currency') || msg.includes('bad_amount')) return { ok: false, code: 'bad_request' };
    logger.error(`[luckyDayService, chargeLuckyDay] RPC horoscope_lucky_pay_charge error telegram=${telegramId}: ${chargeErr.message}`);
    return { ok: false, code: 'db_error' };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    ok: true,
    crystal: row?.crystal ?? null,
    user_id: row?.user_id ?? null,
  };
}

//* Основная функция
async function pickLuckyDay(telegramId, queryRu, rangeDays = 7) {

  const allowedRange = new Set([7, 15, 30]);
  const rDays = allowedRange.has(Number(rangeDays)) ? Number(rangeDays) : 7;

  // 1) грузим справочники из БД
  const [allowedTags, allowedScoreKeys] = await Promise.all([
    getAllowedTags(),
    getAllowedScoreKeys(),
  ]);

  const allowedTagsSet = new Set(allowedTags);
  const allowedScoreKeysSet = new Set(allowedScoreKeys);

  // 2) сначала проверим профиль+кандидатов (чтобы НЕ списывать, если профиля нет)
  const todayIso = new Date().toISOString().slice(0, 10);
  const dateFrom = todayIso;
  const dateTo = new Date(Date.now() + rDays * 86400000).toISOString().slice(0, 10);

  const { data: rows, error: candErr } = await supabase.rpc('horoscope_lucky_candidates', {
    p_telegram: telegramId,
    p_from: dateFrom,
    p_to: dateTo
  });

  if (candErr) {
    logger.error(`[luckyDayService, pickLuckyDay] RPC horoscope_lucky_candidates error telegram=${telegramId}: ${candErr.message}`);
    throw candErr;
  }

  const hasProfile = !!rows[0].has_profile;
  if (!hasProfile) return { ok: true, hasProfile: false };

  const payRes = await chargeLuckyDay(telegramId);
  if (!payRes.ok) {
    return {
      ok: false,
      code: payRes.code,
      price: payRes.price,
      //prices: { crystal: PRICES.LUCKYDAY_CRYSTAL, coin: PRICES.LUCKYDAY_MONET }
    };
  }

  // 4) нейронка -> intent/avoid/weights
  const neuralPayload = {
    query_ru: queryRu.trim(),
    allowed_tags_en: allowedTags,
    allowed_score_keys: allowedScoreKeys
  };

  let neural;

  try {
    neural = await callLuckyNeuralWithRetry(neuralPayload, allowedTagsSet, allowedScoreKeysSet);
  } catch(e) {
    await refundLuckyDay(telegramId);
    logger.error(`[luckyDayService, pickLuckyDay] neural failed telegram=${telegramId}: ${e.message}`);
    return { ok: false, code: 'horoscope_failed' }; // хэндлер вернёт 502    
  }

  // 5) скоринг кандидатов
  let best = null;
  const scored = [];

  for (const r of rows) {
    const s = scoreDay(r.day_params, r.tags, neural);
    const item = {
      day: r.day,
      score: s.finalScore,
      score_numbers: s.scoreNumbers,
      score_tags: s.scoreTags,
      intent_match: s.intentMatch,
      avoid_match: s.avoidMatch,
      tags: r.tags
    };
    scored.push(item);
    if (!best || item.score > best.score) best = item;
  }

  scored.sort((a, b) => b.score - a.score);

  const top3 = scored.slice(0, 3);
  const bestDay = top3[0]?.day || null;

  // ТЕКСТ — от нейронки
  const bestTextRu = (neural.best_text_ru || '').trim();

  const topDaysJson = top3.map(x => x.day);

  // Сохранение истории
  try {
    await supabase.rpc('horoscope_lucky_history_add', {
      p_telegram: telegramId,
      p_query_ru: queryRu.trim(),
      p_range_days: rDays,
      p_best_day: bestDay,
      p_top_days: topDaysJson,
      p_best_text_ru: bestTextRu
    });
  } catch (e) {
    logger.error(`[luckyDayService, pickLuckyDay] history_add failed telegram=${telegramId}: ${e.message}`);
    return { ok: false, code: `${e.message}` };
  }
  const pay = 'crystal'
  await logEvent.logEvent(telegramId,'lucky_day', {pay}) //Отмечаем событие

  return {
    ok: true,
    hasProfile: true,
    range_days: rDays,
    best_day: bestDay,
    top3: topDaysJson,         // только даты (как ты хотела)
    best_text_ru: bestTextRu,  // описание только лучшего дня
    balance: {
      crystal: payRes.crystal
    }
  };
}

module.exports = {
  pickLuckyDay
};
