const supabase = require('../supabaseClient'); 
const logger = require('../logger');

//*Получение необходимых данных для Гл.меню
async function termAccepted(telegramId) {
  if (!/^\d+$/.test(telegramId)) { //регулярное выражение, которое проверяет: состоит ли строка только из цифр
    return { status: false }; // пользователь не найден, нужно показать документы
  }
  const{data: updTerm, error:updTermError} = await supabase
    .from('users')
    .select ('signed')
    .eq('telegram_real',telegramId)
    .maybeSingle();
  if(updTermError) {
    logger.error(`[politicAcceptedService, termAccepted] Ошибка при обращении к users для ${telegramId}: ${updTermError.message}`);
    throw updTermError;
  }

  let term = Boolean(false);

  if(updTerm){
    term = Boolean(true);
  }

  return{
    status: term,
  }
}

module.exports = {
  termAccepted  
}