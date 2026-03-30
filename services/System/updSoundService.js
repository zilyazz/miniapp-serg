const supabase = require('../../supabaseClient'); 
const logger = require('../../logger');

//* запоминаем включаем или выключаем звук у игрока
async function updSoundUser(telegramId, sound) {

  const { error: soundError } = await supabase
    .from('users')
    .update({sound: sound})
    .eq ('telegram',telegramId);
  if (soundError) {
    logger.error(`[levelUpService, levelUpfunc] Ошибка при обращении к user_experience для ${telegramId}: ${soundError.message}`);
    throw soundError;
  }
  
  return { status: 'ok' };
}

module.exports = {
  updSoundUser
}