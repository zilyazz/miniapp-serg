//TODO Проверка подписки
const supabase = require('../../supabaseClient');
const logger = require('../../logger');

async function subDesc(telegramId) {
  //logger.debug(`[subcribeCheckService, subDesc] Найдем user_id для telegramId=${telegramId}`);
  const{data:user,error:userError} = await supabase
    .from('users')
    .select('id')
    .eq('telegram',telegramId)
    .single();
  if(userError) {
    logger.error(`[subcribeCheckService, subDesc] Ошибка рпи обращении к users для telegramId=${telegramId}: ${userError.message}`);
    throw userError;
  }
  //logger.debug(`[subcribeCheckService, subDesc] Проверим подписку для telegramId=${telegramId}`);
  const{data: sub, error: subError} = await supabase
    .from('subscribe')
    .select('date_end')
    .eq('user_id',user.id)
    .maybeSingle();
  if(subError) {
    logger.error(`[subcribeCheckService, subDesc] Ошибка рпи обращении к subscribe для telegramId=${telegramId}: ${subError.message}`);
    throw subError;
  }

  let status ='NoSub';
  if(!sub){
    return status;
  };
  
  let yourDate = new Date().toISOString().split('T')[0];

  if(sub.date_end <= yourDate){
    status = 'EndSub';
    return status
  };
  status = 'GoSub'
  return status;
}

module.exports = {
  subDesc,
}