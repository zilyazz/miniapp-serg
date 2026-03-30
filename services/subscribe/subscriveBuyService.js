//TODO Покупка подписки
const supabase = require('../../supabaseClient');
const logger = require('../../logger');

async function subscrBuy(id,telegramId) {
  const{data:user,error:userError} = await supabase
    .from('users')
    .select('id')
    .eq('telegram',telegramId)
    .single();
  if(userError) throw userError;

  //logger.debug(`[subscriveBuyService, subscrBuy] Вызов RPC subscrive_buy для telegramId=${telegramId}`);

  const { data: result, error } = await supabase.rpc('subscrive_buy', {
    id: id,
    user_id: user.id
  });
  if(error) {
    logger.error(`[subscriveBuyService, subscrBuy] Ошибка при вызове RPC subscrive_buy  для ${telegramId}: ${error.message}`);
    throw error;
  }
  return result;
}

module.exports = {
  subscrBuy,
}