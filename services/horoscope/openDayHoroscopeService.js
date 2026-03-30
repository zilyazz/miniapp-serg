// TODO Открытие дня, чтобы посмотреть гороскоп
const supabase = require('../../supabaseClient');
const { PRICES } = require('../../utils/constants');
const logger = require('../../logger');

async function openDayHoroscope(telegramId, day) {

  const { data: rows, error: rpcError } = await supabase.rpc('horoscope_open_day', {
    p_telegram: telegramId,
    p_day: day
  });
  if (rpcError) {
    logger.error(`[openDayHoroscopeService, openDayHoroscope] Ошибка при вызове RPC horoscope_open_day для ${telegramId}: ${rpcError.message}`);
    throw rpcError;
  }

  const row = Array.isArray(rows) ? rows[0] : rows;
  const has_profile  = row?.has_profile;
  const horoscope_status = row?.horoscope_status;

  if (!has_profile) {
    return {
      ok: true,
      has_profile: false
    }
  }

  if (horoscope_status === 'missing') {
    return { 
      ok: false, 
      error: 'invalid_day' 
    };
  }


  // цены фронту
  const price_prem_horoscope_crystal = PRICES.HOROSCOPE_PREM_OPEN_CRYSTAL;
  const price_future_day_crystal = PRICES.HOROSCOPE_FUTURE_DAY_CRYSTAL;
  const price_lucky_day_crystal = PRICES.HOROSCOPE_LUCKYDAY_CRYSTAL;


  // обычная выдача

  return {
    ok: true,
    has_profile: true,
    sign_code: row.sign_code,
    is_premium: row.is_premium_sub,

    day_unlocked: row.day_unlocked,
    premium_unlocked: row.premium_unlocked,

    can_view_public: row.can_view_public,
    can_view_premium: row.can_view_premium,

    need_buy_day: row.need_buy_day,
    need_buy_premium: row.need_buy_premium,

    general_public: row.general_public,
    general_premium: row.general_premium,

    prices: {
      prem_horoscope_crystal: price_prem_horoscope_crystal,
      day_open_crystal: price_future_day_crystal,
      lucky_day_crystal: price_lucky_day_crystal
    }
  };
}

module.exports = {
  openDayHoroscope,
};
