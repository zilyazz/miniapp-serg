//TODO Покупка товаров в магазине

const supabase = require('../../supabaseClient');
const logger = require('../../logger');

async function buyShopItems(telegramId, itemId) {
  //logger.debug(`[buyShopItemsService, buyShopItems] Определим id для telegramId=${telegramId}`);
  const {data: userData, error: userError} = await supabase
    .from('users')
    .select('id')
    .eq('telegram',telegramId)
    .maybeSingle();
  if(userError) {
    logger.error(`[buyShopItemsService, buyShopItems] Ошибка поиска users -> id для telegramId=${telegramId}: ${userError.message}`);
    throw userError;
  }
  if (!userData) {
    throw new Error('user_not_found');
  }

  //logger.debug(`[buyShopItemsService, buyShopItems] buy_shop_item: Покупка id=${itemId} для telegramId=${telegramId}`);
  const {data: status,error} = await supabase.rpc('buy_shop_item',{
    user_id: userData.id,
    item_id: itemId
  });
  if(error) {
    logger.error(`[buyShopItemsService, buyShopItems] RPC buy_shop_item для telegramId=${telegramId} вернул: ${JSON.stringify(status)}`);
    throw error;
  }
  if(status === 'ok'){
    return {status: 'ok'};
  }

  if(status ==='already_bought'){
    return {status: 'already_bought'};
  }

  if(status === 'not_enough_points'){
    return { status: 'not_enough_points' };
  }

  if(status === 'not_enough_crystals'){
    const{data:crystalOffers,error:offersError} = await supabase
      .from('crystal_purchase_options')
      .select('crystals,price_money')
      .order('crystals');
    if(offersError) {
      logger.error(`[buyShopItemsService, buyShopItems] Ошибка загрузки conversion_rates для telegramId=${telegramId}: ${offersError.message}`);
      throw offersError;
    }
    return {
      status: 'not_enough_crystals',
      crystalOffers
    }
  }

  return { status: 'error', message: `Unknown status: ${status}` };
}

module.exports = {
  buyShopItems,
}
