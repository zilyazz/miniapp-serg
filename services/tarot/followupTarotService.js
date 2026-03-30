const fs = require('fs');
const path = require('path');
const supabase = require('../../supabaseClient');
const logger = require('../../logger');
const axios = require('axios');
const { LIMITS, PRICES } = require('../../utils/constants');
const logEvent = require('../System/CJM');
const tarotRaw = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../runeLibr/tarotCards.json'), 'utf8')
);


// 1) Сплющиваем колоду в один массив
const allTarotCards = [
  ...(tarotRaw.majorArcana || []),
  ...((tarotRaw.minorArcana?.wands)      || []),
  ...((tarotRaw.minorArcana?.cups)       || []),
  ...((tarotRaw.minorArcana?.swords)     || []),
  ...((tarotRaw.minorArcana?.pentacles)  || []),
];

// 2) Map: id -> name
const tarotNameById = new Map();
for (const card of allTarotCards) {
  tarotNameById.set(card.id, card.name);
}

// 3) Парсинг ключа вида "40,37,59*,33"
function keyToNamesArray(key) {
  if (!key || typeof key !== 'string') return [];

  return key
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((raw) => {
      const isReversed = raw.endsWith('*');
      const idStr      = isReversed ? raw.slice(0, -1) : raw;
      const id         = Number(idStr);
      if (Number.isNaN(id)) return null;

      const baseName = tarotNameById.get(id);
      if (!baseName) return null;

      return isReversed ? `${baseName} (перевернутая)` : baseName;
    })
    .filter(Boolean);
}

// 4) Преобразование значения поля cards из БД → массив имён для нейронки
function cardsFieldToNames(cardsField) {
  if (!cardsField) return [];

  // Если вдруг в БД int[] / text[] — поддержим и это
  if (Array.isArray(cardsField)) {
    return cardsField
      .flatMap((token) => {
        if (typeof token === 'number') {
          const name = tarotNameById.get(token);
          return name ? [name] : [];
        }
        if (typeof token === 'string') {
          // может быть "40" или "40*"
          return keyToNamesArray(String(token));
        }
        return [];
      });
  }

  // Обычный случай: в БД TEXT вида "40,37,59*,33"
  if (typeof cardsField === 'string') {
    return keyToNamesArray(cardsField);
  }

  return [];
}

// 5) Выбор одной случайной карты Таро с шансом перевёрнутости 50/50
function pickRandomCard() {
  const index = Math.floor(Math.random() * allTarotCards.length);
  const card  = allTarotCards[index];

  const isReversed = Math.random() < 0.5;

  const keyToken      = isReversed ? `${card.id}*` : String(card.id);              // то, что пойдёт в БД в p_cards
  const nameForNeural = isReversed ? `${card.name} (перевернутая)` : card.name;   // то, что пойдёт в нейронку

  return {
    ...card,
    isReversed,
    keyToken,
    nameForNeural,
  };
}

// FREE FOLLOWUP
async function createFollowupTarot(telegramId, sessionId, question) {
  const limit_base         = LIMITS.TAROT_FOLLOWUP_BASE;
  const limit_prem         = LIMITS.TAROT_FOLLOWUP_PREAM;
  const maxPerSession      = LIMITS.TAROT_FOLLOWUP_PER_SESSION;

  // 1) Квота на бесплатное продолжение
  const { data: quotaRows, error: quotaErr } = await supabase.rpc('tarot_followup_quota', {
    p_telegram:        telegramId,
    p_session_id:      sessionId,
    p_limit_base:      limit_base,
    p_limit_prem:      limit_prem,
    p_max_per_session: maxPerSession,
  });

  if (quotaErr) {
    logger.error(
      `[followupTarotService, createFollowupTarot] Ошибка при вызове RPC tarot_followup_quota для ${telegramId}: ${quotaErr.message}`
    );
    throw quotaErr;
  }

  const quota = Array.isArray(quotaRows) ? quotaRows[0] : quotaRows;

  const { can_free, attempts_left, user_id: userId, is_prem: prem } = quota;

  // Если бесплатных продолжений больше нет → говорим фронту "надо платить"
  if (!can_free) {
    return {
      ok: true,
      pay: true,
      crystal: PRICES.TAROT_FOLLOWUP_CRYSTAL,
      free_left: attempts_left,
    };
  }

  // 2) Тянем историю этой сессии для контекста
  const { data: spreads, error: spreadsErr } = await supabase
    .from('tarot_spreads')
    .select('id, kind, seq, question, cards, description')
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .order('seq', { ascending: true });

  if (spreadsErr) {
    logger.error(
      `[followupTarotService, createFollowupTarot] Ошибка при запросе tarot_spreads для session=${sessionId}, telegram=${telegramId}: ${spreadsErr.message}`
    );
    throw spreadsErr;
  }

  // seq для нового продолжения
  const nextSeq = spreads.length; // 0 - main, 1..N - followups

  // История для нейронки
  const history = spreads.map((s) => {
    const ids = Array.isArray(s.cards) ? s.cards : [];
    return {
      question: s.question,
      cards: cardsFieldToNames(ids),
      interpretation: s.description,
      kind: s.kind,
      seq: s.seq,
    };
  });

  // 3) Тянем одну новую карту
  const card = pickRandomCard();
  const key  = card.keyToken;        // "42" или "42*"

  // 4) Нейронка
  const neural = await callNeuralFollowup(history, card.nameForNeural, question, prem);
  if (!neural.ok) {
    // бесплатное продолжение, денег не списывали — просто говорим, что сейчас не можем
    return { ok: false, code: 'tarot_followup_failed' };
  }

  const interpretation = neural.interpretation;

  // 6) Пишем продолжение в историю
  const { error: insertErr } = await supabase.rpc('tarot_insert_spread', {
    p_telegram:    telegramId,
    p_theme:       'tarot',       // если тем больше нет — можно писать null или 'tarot'
    p_type:        'follow',       // либо сохранить тип из основной сессии, если хочешь
    p_cards:       key,        // "42"
    p_question:    question,
    p_description: interpretation,
    p_pay:         false,
    p_session_id:  sessionId,
    p_kind:        'followup',
    p_seq:         nextSeq,
  });
  if (insertErr) {
    logger.error(
      `[followupTarotService, createFollowupTarot] Ошибка при вызове RPC tarot_insert_spread (followup) для ${telegramId}: ${insertErr.message}`
    );
    throw insertErr;
  }

    
  await logEvent.logEvent(telegramId,'tarot_followup', {"pay": "free"}) //Отмечаем событие

  return {
    pay: false,
    session_id: sessionId,
    followup_seq: nextSeq,
    card_id: card.keyToken,
    card_name: card.nameForNeural,
    interpretation,
  };
}

async function createPayFollowupTarot(telegramId, sessionId, question) {

  const amount = PRICES.TAROT_FOLLOWUP_CRYSTAL
  const maxused = LIMITS.TAROT_FOLLOWUP_PER_SESSION;

  // 1) Списываем оплату
  const { data: payRows, error: chargeErr } = await supabase.rpc('tarot_followup_pay_charge', {
    p_telegram: telegramId,
    p_amount:   amount,
    p_max_per_session: maxused,
    p_session_id: sessionId
  });

  if (chargeErr) {
    const msg = chargeErr.message || '';
    if (msg.includes('insufficient_funds_crystals')) {
      return { ok: false, code: 'not_enough_crystals', price: amount };
    }
    if (msg.includes('insufficient_funds_coins')) {
      return { ok: false, code: 'not_enough_coins', price: amount };
    }
    if (msg.includes('bad_currency') || msg.includes('bad_amount')) {
      return { ok: false, code: 'bad_request' };
    }
    return { ok: false, code: 'db_error' };
  }

  const payRow = Array.isArray(payRows) ? payRows[0] : payRows;
  const prem        = payRow?.prem;
  const crystal_res = payRow?.crystal;
  const userId      = payRow?.user_id;

  if (!userId) {
    logger.error('[followupTarotService, createPayFollowupTarot] user_id is missing from tarot_pay_charge result');
    return { ok: false, code: 'internal_error' };
  }

  // 2) История этой сессии
  const { data: spreads, error: spreadsErr } = await supabase
    .from('tarot_spreads')
    .select('id, kind, seq, question, cards, description')
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .order('seq', { ascending: true });

  if (spreadsErr) {
    logger.error(
      `[followupTarotService, createPayFollowupTarot] Ошибка при запросе tarot_spreads для session=${sessionId}, telegram=${telegramId}: ${spreadsErr.message}`
    );
    throw spreadsErr;
  }

  const nextSeq = spreads.length; // следующее продолжение

  const history = spreads.map((s) => {
    const ids = Array.isArray(s.cards) ? s.cards : [];
    return {
      question: s.question,
      cards: cardsFieldToNames(ids),
      interpretation: s.description,
      kind: s.kind,
      seq: s.seq,
    };
  });

  // 3) Тянем карту
  const card = pickRandomCard();
  const key  = card.keyToken;

  // 4) Нейронка
  const neural = await callNeuralFollowup(history, card.nameForNeural, question, prem);

  if (!neural.ok) {
    // откатываем списание валюты
    const { error: refErr } = await supabase.rpc('tarot_pay_refund', {
      p_telegram: telegramId,
      p_amount:   amount,
    });
    if (refErr) {
      logger.error(
        `[followupTarotService, createPayFollowupTarot] Ошибка при вызове RPC tarot_pay_refund для ${telegramId}: ${refErr.message}`
      );
      throw refErr;
    }

    return { ok: false, code: 'tarot_followup_failed' };
  }

  const interpretation = neural.interpretation;

  // 6) Пишем платное продолжение в историю
  const { error: insertErr } = await supabase.rpc('tarot_insert_spread', {
    p_telegram:    telegramId,
    p_theme:       'tarot',
    p_type:        'follow',
    p_cards:       key,
    p_question:    question,
    p_description: interpretation,
    p_pay:         true,
    p_session_id:  sessionId,
    p_kind:        'followup',
    p_seq:         nextSeq,
  });
  if (insertErr) {
    logger.error(
      `[followupTarotService, createPayFollowupTarot] Ошибка при вызове RPC tarot_insert_spread (paid followup) для ${telegramId}: ${insertErr.message}`
    );
    throw insertErr;
  }
  const pay = 'crystal';
  
  await logEvent.logEvent(telegramId,'tarot_followup', {pay}) //Отмечаем событие

  return {
    ok: true,
    session_id: sessionId,
    followup_seq: nextSeq,
    card_id:  card.keyToken,
    card_name: card.nameForNeural,
    interpretation,
    crystal: crystal_res,
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

async function callNeuralFollowup(history, newCard, question, premium) {
  // history: [{ question, cards: [..names], interpretation, kind, seq }, ...]
  for (let attempt = 0; attempt <= MAX_ATTEMPTS; attempt++) { 
    const payload = {
      history: history,                 // Массив истории раскладов
      new_card: newCard,                // Новая карта (ОДНА карта)
      question: question,                // Новый вопрос
      premium: premium,                  // true | false
      model: 'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8',
    };
  
    const data = await axios.post('http://localhost:8080/api/v1/tarot/followup', payload);

    let text = data.data.interpretation;

    if (!data || typeof text !== 'string' || text.trim().length < 20) {
      return { ok: false, error: 'invalid_response' };
    }

    if (isValidNeuralText(text)) {
      return { ok: true, interpretation: data.data.interpretation.trim() };
    }

  }

  return { ok: false, error: 'invalid_s_response' }
  //return { ok: true, interpretation: 'Ну перестань покупать фигню' };
}

module.exports = {
  createFollowupTarot,
  createPayFollowupTarot,
};
