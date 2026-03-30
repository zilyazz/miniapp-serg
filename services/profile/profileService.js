//TODO Меню профиля

const { subcribe } = require('../../handlers/subscribe/subscribehandler');
const supabase = require('../../supabaseClient');
const logger = require('../../logger');

async function profileMenu(telegramId) {
  //logger.debug(`[profileService, profileMenu] Получим данные для профиля для telegramId=${telegramId}`);
  const{data:user, error: userError} = await supabase
    .from('users')
    .select('id,subscribe(sub_id,date_end)')
    .eq('telegram',telegramId)
    .maybeSingle();
  if(userError) {
    logger.error(`[profileService, profileMenu] Ошибка отбора данных для telegramId=${telegramId}: ${userError.message}`);
    throw userError;
  }

  const { data: birthProfile, error: birthProfileError } = await supabase
    .from('birth_profiles')
    .select('birth_date,birth_time,has_exact_time,place_name,name,sex')
    .eq('user_id', user.id)
    .maybeSingle();
  if (birthProfileError) {
    logger.error(`[profileService, profileMenu] Ошибка отбора birth_profiles для telegramId=${telegramId}: ${birthProfileError.message}`);
    throw birthProfileError;
  }

  return {
    id: user.id,
    date: user.subscribe?.date_end ?? null,
    birth_date: birthProfile?.birth_date ?? null,
    birth_time: birthProfile?.birth_time ?? null,
    has_exact_time: birthProfile?.has_exact_time ?? null,
    place_name: birthProfile?.place_name ?? null,
    name: birthProfile?.name ?? null,
    sex: birthProfile?.sex ?? null
  };
}

module.exports = {
  profileMenu,
}
