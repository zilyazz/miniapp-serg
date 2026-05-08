//TODO Надевание предмета из инвентаря 

const supabase = require('../../supabaseClient');
const logger = require('../../logger');

async function equipObject(telegramId,item_id) {
  
  const{data:user, error: userError} = await supabase
    .from('users')
    .select('id')
    .eq('telegram',telegramId)
    .single();

  if(userError) {
    logger.error(`[equipObjectService, equipObject] Ошибка поиска users -> id: ${userError.message}`);
    throw userError;
  }

  //logger.debug(`[equipObjectService, equipObject] Найден user_id=${user.id} для telegramId=${telegramId}`);

  const {data:equip,error:equipError} = await supabase
    .rpc('equip_item',{user_id: user.id, item_id: item_id });

  if (equipError) {
    logger.error(`[equipObjectService, equipObject] Ошибка при вызове RPC equip_item: ${equipError.message}`);
    throw equipError;
  }
  //logger.debug(`[equipObjectService] RPC equip_item вернул: ${JSON.stringify(equip)}`);

  return equip;
}

module.exports = {
  equipObject,
}