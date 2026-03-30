//TODO Варианты подписки 
const supabase = require('../../supabaseClient');
const logger = require('../../logger');

async function subDesc() {
  const{data: sub, error: subError} = await supabase
    .from('subscribe_description')
    .select('id,description,month')
    .order('level');
  if(subError) {
    logger.error(`[subscribeService, subDesc] Ошибка при обращении к subscribe_description: ${subError.message}`);
    throw subError;
  }
  return sub;
}

module.exports = {
  subDesc,
}