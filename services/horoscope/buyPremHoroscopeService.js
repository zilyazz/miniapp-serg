// TODO Покупка премиум части гороскопа
const supabase = require('../../supabaseClient');
const { PRICES } = require('../../utils/constants');
const logger = require('../../logger');

async function buyPremHoroscope(telegramId, day) {
  
  const price = PRICES.HOROSCOPE_PREM_OPEN_CRYSTAL;
  
  const { data: paydata, error: chargeErr } = await supabase.rpc('horoscope_buy_premium', {
    p_telegram: telegramId,
    p_day: day,
    p_amount: price
  });
  console.log("🚀 ~ buyPremHoroscope ~ paydata:", paydata)
  if(chargeErr) {
    const msg = chargeErr.message || '';
    if (msg.includes('insufficient_funds_crystals')) return { ok: false, code: 'not_enough_crystals', price: price };
    if (msg.includes('insufficient_funds_coins'))   return { ok: false, code: 'not_enough_coins',    price: price };
    if (msg.includes('bad_currency') || msg.includes('bad_amount')) return { ok: false, code: 'bad_request' };
    logger.error(`[buyPremHoroscopeService, buyPremHoroscope] Ошибка при вызове RPC horoscope_buy_premium для ${telegramId}: ${chargeErr.message}`);
    return { ok: false, code: 'db_error' };
  }

  const row = Array.isArray(paydata) ? paydata[0] : paydata;
  //const userId      = row?.user_id;
  const crystal_res = row?.crystal;
  const general_premium = row?.general_premium;

  return {
    ok: true,
    crystal: crystal_res,
    general_premium: general_premium,
  };
}

module.exports = {
  buyPremHoroscope,
};
