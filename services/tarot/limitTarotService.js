const supabase = require('../../supabaseClient');
const logger = require('../../logger');
const { LIMITS } = require('../../utils/constants');

// Остаток попыток таро на сегодня (для бейджа и подписи под инпутом)
async function getLimitTarot(telegramId) {
  const limit_base = LIMITS.TAROT_MAIN_BASE_PER_DAY;
  const limit_prem = LIMITS.TAROT_MAIN_PREM_PER_DAY;
  const windowHours = LIMITS.TAROT_MAIN_WINDOW_HOURS;
  const pr_lim = limit_prem;

  const { data, error } = await supabase.rpc('get_layout_limit_status', {
    p_telegram: telegramId,
    p_theme: 'tarot',
    p_type: 'main',
    p_base_limit: limit_base,
    p_premium_limit: limit_prem,
    p_window_hours: windowHours
  });

  if (error) {
    logger.error(
      `[limitTarotService, getLimitTarot] Ошибка при вызове RPC get_layout_limit_status для ${telegramId}: ${error.message}`
    );
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    limit_total: row?.max != null ? Number(row.max) : 0,
    quota_left: row?.quota_left != null ? Number(row.quota_left) : 0,
    pr_lim
  };
}

module.exports = {
  getLimitTarot
};
