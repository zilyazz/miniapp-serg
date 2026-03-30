const fs = require('fs');
const path = require('path');
const axios = require('axios');
const supabase = require('../../supabaseClient');
const logger = require('../../logger');
const logEvent = require('../System/CJM');

const TAROT_DAY_TABLE = process.env.TAROT_DAY_TABLE || 'users_tarot_day';
const PROMPTS_TABLE = process.env.AI_PROMPTS_TABLE || 'ai_prompts';
const TAROT_DAY_PROMPT_CODE = process.env.TAROT_DAY_PROMPT_CODE || 'tarot_day';
const TAROT_DAY_NEURAL_URL = process.env.TAROT_DAY_NEURAL_URL || 'http://localhost:8080/api/v1/tarot/day';
const TAROT_DAY_TTL_MS = Number(process.env.TAROT_DAY_TTL_MS || 24 * 60 * 60 * 1000);
const MAX_ATTEMPTS = 2;

const tarotRaw = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../runeLibr/tarotCards.json'), 'utf8')
);

const tarotFlatLibrary = [
  ...(tarotRaw.majorArcana || []),
  ...((tarotRaw.minorArcana?.wands) || []),
  ...((tarotRaw.minorArcana?.cups) || []),
  ...((tarotRaw.minorArcana?.swords) || []),
  ...((tarotRaw.minorArcana?.pentacles) || []),
];

const tarotCardById = new Map();
for (const card of tarotFlatLibrary) {
  tarotCardById.set(Number(card.id), card);
}

function isExpired(drawnAt) {
  if (!drawnAt) return false;
  const drawnAtMs = new Date(drawnAt).getTime();
  if (Number.isNaN(drawnAtMs)) return true;
  return Date.now() - drawnAtMs >= TAROT_DAY_TTL_MS;
}

function parseCardKey(cardKey) {
  if (!cardKey || typeof cardKey !== 'string') return null;

  const reversed = cardKey.endsWith('*');
  const rawId = reversed ? cardKey.slice(0, -1) : cardKey;
  const id = Number(rawId);
  if (Number.isNaN(id)) return null;

  const card = tarotCardById.get(id);
  if (!card) return null;

  return {
    ...card,
    card_key: cardKey,
    reversed,
    display_name: reversed ? `${card.name} (перевернутая)` : card.name,
  };
}

function pickRandomCardKey() {
  const randomCard = tarotFlatLibrary[Math.floor(Math.random() * tarotFlatLibrary.length)];
  const reversed = Math.random() < 0.5;
  return reversed ? `${randomCard.id}*` : `${randomCard.id}`;
}

async function getUserIdByTelegram(telegramId) {
  const { data: user, error } = await supabase
    .from('users')
    .select('id')
    .eq('telegram', telegramId)
    .single();

  if (error || !user) {
    logger.error(`[tarotDayService, getUserIdByTelegram] user lookup failed for ${telegramId}: ${error?.message}`);
    throw error || new Error('user_not_found');
  }

  return user.id;
}

async function getOrCreateTarotDayRow(userId) {
  let { data: row, error } = await supabase
    .from(TAROT_DAY_TABLE)
    .select('id, user_id, card_key, interpretation, drawn_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    logger.error(`[tarotDayService, getOrCreateTarotDayRow] select failed for userId=${userId}: ${error.message}`);
    throw error;
  }

  if (!row) {
    const { data: inserted, error: insertError } = await supabase
      .from(TAROT_DAY_TABLE)
      .insert([{ user_id: userId }])
      .select('id, user_id, card_key, interpretation, drawn_at')
      .single();

    if (insertError) {
      if (String(insertError.code) === '23505') {
        const { data: retryRow, error: retryError } = await supabase
          .from(TAROT_DAY_TABLE)
          .select('id, user_id, card_key, interpretation, drawn_at')
          .eq('user_id', userId)
          .maybeSingle();

        if (retryError) {
          logger.error(`[tarotDayService, getOrCreateTarotDayRow] retry select failed for userId=${userId}: ${retryError.message}`);
          throw retryError;
        }

        row = retryRow;
      } else {
        logger.error(`[tarotDayService, getOrCreateTarotDayRow] insert failed for userId=${userId}: ${insertError.message}`);
        throw insertError;
      }
    } else {
      row = inserted;
    }
  }

  return row;
}

async function clearExpiredRow(rowId) {
  const { error } = await supabase
    .from(TAROT_DAY_TABLE)
    .update({
      card_key: null,
      interpretation: null,
      drawn_at: null,
    })
    .eq('id', rowId);

  if (error) {
    logger.error(`[tarotDayService, clearExpiredRow] update failed for rowId=${rowId}: ${error.message}`);
    throw error;
  }
}

async function getCurrentTarotDay(userId) {
  const row = await getOrCreateTarotDayRow(userId);
  if (!row?.card_key) {
    return null;
  }

  if (isExpired(row.drawn_at)) {
    await clearExpiredRow(row.id);
    return null;
  }

  const card = parseCardKey(row.card_key);
  if (!card) {
    await clearExpiredRow(row.id);
    return null;
  }

  return {
    card_key: row.card_key,
    name: card.display_name,
    interpretation: row.interpretation || '',
    drawn_at: row.drawn_at,
  };
}

async function getTarotDayPromptConfig() {
  const { data, error } = await supabase
    .from(PROMPTS_TABLE)
    .select('prompt, model')
    .eq('code', TAROT_DAY_PROMPT_CODE)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    logger.error(`[tarotDayService, getTarotDayPromptConfig] prompt lookup failed: ${error.message}`);
    throw error;
  }

  if (!data?.prompt) {
    const err = new Error('tarot_day_prompt_missing');
    err.code = 'tarot_day_prompt_missing';
    throw err;
  }

  if (!data?.model || typeof data.model !== 'string' || !data.model.trim()) {
    const err = new Error('tarot_day_model_missing');
    err.code = 'tarot_day_model_missing';
    throw err;
  }

  return {
    prompt: data.prompt,
    model: data.model.trim(),
  };
}

function buildPrompt(promptTemplate, card) {
  return promptTemplate
    .replaceAll('{{card_name}}', card.name)
    .replaceAll('{{card_display_name}}', card.display_name)
    .replaceAll('{{card_key}}', card.card_key)
    .replaceAll('{{orientation}}', card.reversed ? 'перевернутая' : 'прямая');
}

function isValidNeuralText(text) {
  return typeof text === 'string' && text.trim().length >= 20;
}

async function callTarotDayNeural(prompt, model) {
  for (let attempt = 0; attempt <= MAX_ATTEMPTS; attempt++) {
    const { data } = await axios.post(TAROT_DAY_NEURAL_URL, {
      prompt,
      model,
    });

    const interpretation = data?.interpretation;
    if (isValidNeuralText(interpretation)) {
      return interpretation.trim();
    }
  }

  const err = new Error('tarot_day_neural_failed');
  err.code = 'tarot_day_neural_failed';
  throw err;
}

async function drawTarotDay(telegramId) {
  const userId = await getUserIdByTelegram(telegramId);
  const current = await getCurrentTarotDay(userId);
  if (current) {
    return current;
  }

  const row = await getOrCreateTarotDayRow(userId);
  const cardKey = pickRandomCardKey();
  const card = parseCardKey(cardKey);
  if (!card) {
    const err = new Error('tarot_day_card_invalid');
    err.code = 'tarot_day_card_invalid';
    throw err;
  }

  const promptConfig = await getTarotDayPromptConfig();
  const prompt = buildPrompt(promptConfig.prompt, card);
  const interpretation = await callTarotDayNeural(prompt, promptConfig.model);

  const { error } = await supabase
    .from(TAROT_DAY_TABLE)
    .update({
      card_key: card.card_key,
      interpretation,
      drawn_at: new Date().toISOString(),
    })
    .eq('id', row.id);

  if (error) {
    logger.error(`[tarotDayService, drawTarotDay] update failed for rowId=${row.id}: ${error.message}`);
    throw error;
  }

  await logEvent.logEvent(telegramId, 'tarot_day', { card_key: card.card_key });

  return {
    card_key: card.card_key,
    name: card.display_name,
    interpretation,
  };
}

module.exports = {
  getUserIdByTelegram,
  getCurrentTarotDay,
  drawTarotDay,
};
