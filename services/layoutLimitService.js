// Сервис проверки rolling-лимита раскладов по теме

const supabase = require('../supabaseClient');
const logger = require('../logger');
const { LIMITS } = require('../utils/constants');

async function isLayoutAllowed(telegramId, theme, type) {
  const { data, error } = await supabase.rpc('get_layout_limit_status', {
    p_telegram: telegramId,
    p_theme: theme,
    p_type: type,
    p_base_limit: LIMITS.RUNES_LIMIT_BASE,
    p_premium_limit: LIMITS.RUNES_LIMIT_PREM,
    p_window_hours: LIMITS.RUNES_LIMIT_WINDOW_HOURS
  });

  if (error) {
    logger.error(`[layoutLimitService, isLayoutAllowed] Ошибка при вызове RPC get_layout_limit_status для ${telegramId}: ${error.message}`);
    throw error;
  }

  const state = Array.isArray(data) ? data[0] : data;
  if (!state) {
    throw new Error('layout_limit_status_empty');
  }

  return {
    allowed: Boolean(state.allowed),
    used: Number(state.used ?? 0),
    max: Number(state.max ?? LIMITS.RUNES_LIMIT_BASE),
    quota_left: Number(state.quota_left ?? 0),
    window_started_at: state.window_started_at ?? null,
    window_expires_at: state.window_expires_at ?? null,
    is_premium: Boolean(state.is_premium)
  };
}

module.exports = {
  isLayoutAllowed,
};
