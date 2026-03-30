// TODO Покупка будущего дня горсокопа
const supabase = require('../../supabaseClient');
const { PRICES } = require('../../utils/constants');
const logger = require('../../logger');

async function buyFutureHoroscope(telegramId, day) {
  
  const price = PRICES.HOROSCOPE_PREM_OPEN_CRYSTAL;
  
  const { data: paydata, error: chargeErr } = await supabase.rpc('horoscope_buy_day', {
    p_telegram: telegramId,
    p_day: day,
    p_amount: price
  });
  if(chargeErr) {
    const msg = chargeErr.message || '';
    if (msg.includes('insufficient_funds_crystals')) return { ok: false, code: 'not_enough_crystals', price: price };
    if (msg.includes('insufficient_funds_coins'))   return { ok: false, code: 'not_enough_coins',    price: price };
    if (msg.includes('bad_currency') || msg.includes('bad_amount')) return { ok: false, code: 'bad_request' };
    logger.error(`[buyFutureHoroscopeService, buyFutureHoroscope] Ошибка при вызове RPC horoscope_buy_day для ${telegramId}: ${chargeErr.message}`);
    return { ok: false, code: 'db_error' };
  }

  const row = Array.isArray(paydata) ? paydata[0] : paydata;
  //const userId      = row?.user_id;
  const crystal_res = row?.crystal;
  const price_lucky_day_crystal = PRICES.HOROSCOPE_LUCKYDAY_CRYSTAL;

  return {
    ok: true,
    crystal: crystal_res,
    has_profile: true,
    sign_code: row.sign_code,
    day_unlocked: row.day_unlocked,
    premium_unlocked: row.premium_unlocked,
    general_public: row.general_public,
    general_premium: row.general_premium,
    prices: {
      lucky_day_crystal: price_lucky_day_crystal
    }
  };
}

module.exports = {
  buyFutureHoroscope,
};
