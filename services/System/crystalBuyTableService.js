//TODO Данные о вариантах покупке кристаллов за рубли

const supabase = require('../../supabaseClient');
const logger = require('../../logger');

async function crystalMoney() {
  const{data:crystal, error: crystalError} = await supabase
    .from('crystal_purchase_options')
    .select('id,crystals,price_money')
    .order('crystals');
  if(crystalError) {
    logger.error(`[crystalBuyTableService, crystalMoney] Ошибка при обращении к crystal_purchase_options: ${crystalError.message}`);
    throw crystalError;
  }

  return crystal;
}

async function crystalStars() {
  const{data:stars, error: starsError} = await supabase
    .from('crystal_purchase_options')
    .select('id,crystals,price_stars')
    .order('crystals');
  if(starsError) {
    logger.error(`[crystalBuyTableService, crystalStars] Ошибка при обращении к crystal_purchase_options: ${starsError.message}`);
    throw starsError;
  }

  return stars;
}
module.exports = {
  crystalMoney,
  crystalStars
}