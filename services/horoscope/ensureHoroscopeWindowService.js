// services/horoscope/ensureHoroscopeWindowService.js
const supabase = require('../../supabaseClient');
const logger = require('../../logger');
const { HOROSCOPE } = require('../../utils/constants');

const { DateTime } = require('luxon');
const axios = require('axios');

/**
 * Главная функция для крона:
 * - держит окно: [-BACK_DAYS .. +FUTURE_DAYS]
 * - дозаполняет horoscope_days и horoscopes только там, где дырки
 */
async function ensureHoroscopeWindow() {
  const tz = 'Europe/Moscow'; // можно вынести в config/env
  const today = DateTime.now().setZone(tz).startOf('day');

  const dateFrom = today.minus({ days: HOROSCOPE.BACK_DAYS }).toISODate();
  const dateTo = today.plus({ days: HOROSCOPE.FUTURE_DAYS }).toISODate();

  logger.info(`[Horoscope] Ensure window ${dateFrom}..${dateTo}`);

  // 1) Дозаполнить horoscope_days
  await ensureDays(dateFrom, dateTo);

  // 2) Дозаполнить horoscopes
  await ensureHoroscopes(dateFrom, dateTo);

  return { ok: true, range: { from: dateFrom, to: dateTo } };
}

/** 1) Генерация недостающих записей horoscope_days */
async function ensureDays(dateFrom, dateTo) {
  // 1.1 найти отсутствующие дни
  const { data: missingDays, error } = await supabase.rpc('horoscope_missing_days', {
    p_from: dateFrom,
    p_to: dateTo
  });
  if (error) {
    logger.error(`[Horoscope.ensureDays] RPC horoscope_missing_days error: ${error.message}`);
    throw error;
  }

  if (!missingDays || missingDays.length === 0) {
    logger.info('[Horoscope.ensureDays] No missing days');
    return;
  }

  // 1.2 подтянуть подписи типов дня (params)
  const { data: typeParamsRows, error: tpErr } = await supabase.rpc('horoscope_get_day_type_params');
  if (tpErr) {
    logger.error(`[Horoscope.ensureDays] RPC horoscope_get_day_type_params error: ${tpErr.message}`);
    throw tpErr;
  }

  const typeParams = new Map(); // code -> params json
  for (const r of typeParamsRows) typeParams.set(r.day_type_code, r.params);

  // 1.3 подтянуть список типов (для выбора)
  const { data: dayTypes, error: dtErr } = await supabase
    .from('horoscope_day_types')
    .select('code, title_ru, is_enabled')
    .eq('is_enabled', true);

  if (dtErr) throw dtErr;

  const enabledTypes = dayTypes.map(t => t.code);

  // 1.4 Для каждого отсутствующего дня выбираем типы + считаем параметры
  // Важно: генератор должен быть идемпотентным и не зависеть от "дня недели".
  for (const row of missingDays) {
    const day = row.day;

    // Берём вчерашний день, если он уже есть — чтобы строить переходы
    const prevDay = DateTime.fromISO(day).minus({ days: 1 }).toISODate();
    const { data: prev, error: prevErr } = await supabase
      .from('horoscope_days')
      .select('day, primary_type, secondary_type')
      .eq('day', prevDay)
      .maybeSingle();

    if (prevErr) throw prevErr;

    const prevPrimary = prev?.primary_type ?? null;

    const { primaryType, secondaryType } = pickDayTypes(prevPrimary, enabledTypes);

    const dayParams = sumAndClampParams(
      typeParams.get(primaryType) || {},
      secondaryType ? (typeParams.get(secondaryType) || {}) : {}
    );

    const payload = {
      day,
      primary_type: primaryType,
      secondary_type: secondaryType,
      day_params: dayParams,
      generated_by: HOROSCOPE.GENERATOR_VERSION,
      generated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error: insErr } = await supabase
      .from('horoscope_days')
      .upsert(payload, { onConflict: 'day' });

    if (insErr) {
      logger.error(`[Horoscope.ensureDays] upsert horoscope_days failed day=${day}: ${insErr.message}`);
      throw insErr;
    }
  }

  logger.info(`[Horoscope.ensureDays] Filled missing days: ${missingDays.length}`);
}

/**
 * Выбор типов дня (Вариант A: переходы + ограничения).
 * Тут стартовая "простая" версия: достаточно, чтобы не было ощущения рандома.
 * Потом ты усложнишь правила (лимит напряженных в неделю и т.д.).
 */
function pickDayTypes(prevPrimary, enabledTypes) {
  // Базовые веса переходов: "что логично после чего"
  const transitions = {
    tense:      { recovery: 0.45, closing: 0.25, focused: 0.15, emotional: 0.15 },
    focused:    { social: 0.35, active: 0.25, closing: 0.20, emotional: 0.20 },
    social:     { emotional: 0.35, active: 0.25, focused: 0.20, closing: 0.20 },
    emotional:  { social: 0.30, recovery: 0.25, closing: 0.20, active: 0.25 },
    active:     { focused: 0.30, social: 0.30, closing: 0.20, tense: 0.20 },
    closing:    { recovery: 0.35, active: 0.25, focused: 0.20, social: 0.20 },
    recovery:   { active: 0.35, focused: 0.25, social: 0.20, emotional: 0.20 },
    unstable:   { focused: 0.30, recovery: 0.30, closing: 0.20, social: 0.20 },
  };

  // если нет предыдущего дня — выбираем по "общим частотам"
  const baseWeights = { active: 0.16, social: 0.18, emotional: 0.14, focused: 0.14, tense: 0.12, closing: 0.10, recovery: 0.14, unstable: 0.02 };

  const weights = prevPrimary && transitions[prevPrimary] ? transitions[prevPrimary] : baseWeights;
  const primaryType = weightedPick(weights, enabledTypes);

  // Второй тип добавляем редко (пример: 25% дней), и только если он логично сочетается
  let secondaryType = null;
  if (Math.random() < 0.25) {
    const allowedPairs = {
      social: ['emotional'],
      emotional: ['social'],
      focused: ['closing'],
      active: ['social'],
      tense: ['closing'],
      recovery: ['emotional'],
      closing: ['recovery'],
      unstable: ['tense', 'emotional'],
    };
    const candidates = (allowedPairs[primaryType] || []).filter(t => enabledTypes.includes(t));
    if (candidates.length) secondaryType = candidates[Math.floor(Math.random() * candidates.length)];
  }

  return { primaryType, secondaryType };
}

function weightedPick(weightsObj, enabledTypes) {
  const entries = Object.entries(weightsObj).filter(([k]) => enabledTypes.includes(k));
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [k, w] of entries) {
    r -= w;
    if (r <= 0) return k;
  }
  return entries[0]?.[0] || enabledTypes[0];
}

/** Сложение параметров двух типов + ограничение [-1..1] */
function sumAndClampParams(a, b) {
  const out = {};
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const k of keys) {
    const v = Number(a?.[k] || 0) + Number(b?.[k] || 0);
    out[k] = clamp(v, -1, 1);
  }
  return out;
}
function clamp(x, min, max) { return Math.max(min, Math.min(max, x)); }

/** 2) Генерация недостающих гороскопов (horoscopes) */
async function ensureHoroscopes(dateFrom, dateTo) {
  // 2.1 найти отсутствующие пары (дата+знак)
  const { data: missingPairs, error } = await supabase.rpc('horoscope_missing_horoscopes', {
    p_from: dateFrom,
    p_to: dateTo
  });
  if (error) {
    logger.error(`[Horoscope.ensureHoroscopes] RPC horoscope_missing_horoscopes error: ${error.message}`);
    throw error;
  }

  if (!missingPairs || missingPairs.length === 0) {
    logger.info('[Horoscope.ensureHoroscopes] No missing horoscopes');
    return;
  }

  // 2.2 подтянуть словари RU для промпта (чтобы нейронке отдавать русские названия)
  const [paramDict, tagDictRes, signDict] = await Promise.all([
    loadParamDict(),
    loadTagDict(),
    loadSignDict(),
  ]);
  
  const tagDict = tagDictRes.map;       // Map
  const allowedTags = tagDictRes.keys;  // array

  // 2.3 Кэш day_params по дням (чтобы не дергать БД 1000 раз)
  const uniqueDays = Array.from(new Set(missingPairs.map(p => p.day)));
  const dayParamsMap = await loadDayParams(uniqueDays);

  // 2.4 Кэш профилей знаков
  const signProfiles = await loadSignProfiles();

  // 2.5 Генерим по одному (на старте проще), потом можно батчить
  for (const p of missingPairs) {
    const day = p.day;
    const signCode = p.sign_code;

    const dayParams = dayParamsMap.get(day);
    if (!dayParams) {
      logger.warn(`[Horoscope.ensureHoroscopes] Missing day_params for ${day}, skip`);
      continue;
    }

    const profileParams = signProfiles.get(signCode) || {};
    const signTitleRu = signDict.get(signCode) || signCode;

    // Сформировать вход для нейронки по-русски
    const promptPayload = buildHoroscopePromptRu({
      day,
      signTitleRu,
      dayParams,
      profileParams,
      paramDict,
      allowedTags, // <-- массив из таблицы horoscope_tag_dict
    });

    let neural;
    try {
      const allowedTagsSet = new Set(promptPayload.allowed_tags_en);
      const allowedScoreKeysSet = new Set(Array.from(paramDict.keys()));
      neural = await callNeuralWithRetry(promptPayload, allowedTagsSet, allowedScoreKeysSet,1); // 1 повтор = максимум 2 попытки
      
    } catch (e) {
      logger.error(`[Horoscope.ensureHoroscopes] Neural error day=${day} sign=${signCode}: ${e.message}`);
      // сохраняем failed, чтобы видеть проблему
      await supabase.from('horoscopes').upsert({
        day,
        sign_code: signCode,
        content_ru: {
          general_public: 'Ошибка генерации. Попробуйте позже.',
          general_premium: 'Ошибка генерации. Попробуйте позже.'
        },
        content_en: null,
        tags: [],
        scores: {},
        model_version: HOROSCOPE.MODEL,
        status: 'failed',
        generated_at: new Date().toISOString(),
      }, { onConflict: 'day,sign_code' });
      continue;
    }

    // upsert результата
    const { error: upErr } = await supabase
      .from('horoscopes')
      .upsert({
        day,
        sign_code: signCode,
        content_ru: neural.content_ru,
        content_en: null,
        tags: neural.tags || [],
        scores: neural.scores || {},
        model_version: HOROSCOPE.MODEL,
        status: 'published',
        generated_at: new Date().toISOString(),
      }, { onConflict: 'day,sign_code' });

    if (upErr) {
      logger.error(`[Horoscope.ensureHoroscopes] upsert horoscopes failed day=${day} sign=${signCode}: ${upErr.message}`);
      throw upErr;
    }
  }

  logger.info(`[Horoscope.ensureHoroscopes] Filled missing horoscopes: ${missingPairs.length}`);
}

async function loadParamDict() {
  const { data, error } = await supabase
    .from('horoscope_param_dict')
    .select('key_en,title_ru,description_ru')
    .eq('is_enabled', true);
  if (error) throw error;
  const m = new Map();
  for (const r of data) m.set(r.key_en, { title_ru: r.title_ru, description_ru: r.description_ru });
  return m;
}
async function loadTagDict() {
  const { data, error } = await supabase
    .from('horoscope_tag_dict')
    .select('key_en,title_ru,description_ru')
    .eq('is_enabled', true);

  if (error) throw error;

  // Map если где-то потом понадобится (описания, ру-подписи и т.д.)
  const m = new Map();
  const keys = [];

  for (const r of data) {
    m.set(r.key_en, { title_ru: r.title_ru, description_ru: r.description_ru });
    keys.push(r.key_en);
  }

  // возвращаем сразу оба варианта, без хардкода
  return { map: m, keys };
}
async function loadSignDict() {
  const { data, error } = await supabase
    .from('zodiac_signs')
    .select('code,title_ru');
  if (error) throw error;
  const m = new Map();
  for (const r of data) m.set(r.code, r.title_ru);
  return m;
}
async function loadDayParams(days) {
  const { data, error } = await supabase
    .from('horoscope_days')
    .select('day,day_params')
    .in('day', days);
  if (error) throw error;
  const m = new Map();
  for (const r of data) m.set(r.day, r.day_params || {});
  return m;
}
async function loadSignProfiles() {
  const { data, error } = await supabase
    .from('horoscope_sign_profiles')
    .select('sign_code,profile_params');
  if (error) throw error;
  const m = new Map();
  for (const r of data) m.set(r.sign_code, r.profile_params || {});
  return m;
}

/**
 * Строим промпт для нейронки на русском.
 * Важно: нейронка должна вернуть СТРОГО JSON с:
 * - tags (массив EN ключей из tag_dict)
 * - scores (объект EN ключей, значения -1..1)
 */
function buildHoroscopePromptRu({ day, signTitleRu, dayParams, profileParams, paramDict, allowedTags }) {
  const dpRu = Object.entries(dayParams).map(([k, v]) => {
    const title = paramDict.get(k)?.title_ru || k;
    return `${title}: ${Number(v).toFixed(2)}`;
  }).join(', ');

  const spRu = Object.entries(profileParams).map(([k, v]) => {
    const title = paramDict.get(k)?.title_ru || k;
    return `${title}: ${Number(v).toFixed(2)}`;
  }).join(', ');

  // IMPORTANT: allowed_tags_en строго массивом
  return {
    day,
    sign: signTitleRu,
    day_params_ru: dpRu,
    sign_profile_ru: spRu,
    allowed_tags_en: allowedTags
  };
}

async function callNeuralWithRetry(promptPayload, allowedTagsSet, allowedScoreKeysSet, retries = 1) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const neural = await callHoroscopeNeural(promptPayload);

      validateHoroscopeNeural(neural, allowedTagsSet, allowedScoreKeysSet);
      return neural;
    } catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, 250 + Math.random() * 400));
    }
  }
  throw lastErr;
}

async function callHoroscopeNeural(payload) {
  // Подстрой под свой нейро-роут. Я делаю аналогично твоему sonnik callNeural().
  const { data } = await axios.post('http://localhost:8080/api/v1/horoscope/generate', {
    payload,
    model: "Qwen/Qwen3-Next-80B-A3B-Instruct"
  });
  return data;
}

const LETTER_RE = /\p{L}/u;
const CYRILLIC_RE = /\p{Script=Cyrillic}/u;

// true если в строке есть буквы НЕ кириллица (латиница, корейский, японский и т.д.)
function containsNonCyrillicLetters(text) {
  for (const ch of text) {
    if (LETTER_RE.test(ch) && !CYRILLIC_RE.test(ch)) return true;
  }
  return false;
}

function validateHoroscopeNeural(resp, allowedTagsSet, allowedScoreKeysSet) {
  if (!resp || typeof resp !== 'object') throw new Error('invalid_neural_response');
  if (!resp.content_ru || typeof resp.content_ru !== 'object') throw new Error('invalid_content_ru');

  const pub = resp.content_ru.general_public;
  const prem = resp.content_ru.general_premium;

  if (typeof pub !== 'string' || pub.trim().length < 80) throw new Error('too_short_general_public');
  if (typeof prem !== 'string' || prem.trim().length < 120) throw new Error('too_short_general_premium');

  // запрет любых букв не-кириллицы (латиница/корейский/японский и т.д.)
  if (containsNonCyrillicLetters(pub)) throw new Error('forbidden_chars_in_public');
  if (containsNonCyrillicLetters(prem)) throw new Error('forbidden_chars_in_premium');

  // tags
  if (resp.tags != null) {
    if (!Array.isArray(resp.tags)) throw new Error('invalid_tags');
    if (!(allowedTagsSet instanceof Set)) throw new Error('allowed_tags_set_missing');

    for (const t of resp.tags) {
      if (typeof t !== 'string') throw new Error('invalid_tag_item');
      const tag = t.trim();
      if (!allowedTagsSet.has(tag)) throw new Error(`invalid_tag_value:${tag}`);
    }
  }

  // scores
  if (resp.scores != null) {
    if (typeof resp.scores !== 'object' || Array.isArray(resp.scores)) throw new Error('invalid_scores');
    if (!(allowedScoreKeysSet instanceof Set)) throw new Error('allowed_score_keys_set_missing');

    for (const [k, v] of Object.entries(resp.scores)) {
      if (!allowedScoreKeysSet.has(k)) throw new Error(`invalid_score_key:${k}`);
      if (typeof v !== 'number' || Number.isNaN(v)) throw new Error(`invalid_score_value:${k}`);
      if (v < -1 || v > 1) throw new Error(`score_out_of_range:${k}`);
    }
  }
}



module.exports = {
  ensureHoroscopeWindow,
};
