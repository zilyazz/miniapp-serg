//TODO Сервис по истории раскладов

const supabase = require('../supabaseClient');
const logger = require('../logger');

//* Получаем историю раскладов по последним уникальным датам
async function getSpreadHistory(telegramId) {
  // Получаем ID пользователя + тип подписки
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, subscribe(sub_id)')
    .eq('telegram', telegramId)
    .single();
  if (userError) {
    logger.error(`[spreadService, getSpreadHistory] Ошибка при обращении к users для ${telegramId}: ${userError.message}`);
    throw userError;
  }

  const subId = user.subscribe?.sub_id || 1;

  // Определяем лимит по уникальным датам
  const MAX_DATES = subId === 1 ? 5 : 15;

  // Получаем все расклады пользователя, отсортированные по дате убыванию
  const { data: spreads, error: spreadsError } = await supabase
    .from('spreads')
    .select('id, DateCreate, Theme, Type')
    .eq('Userid', user.id)
    .order('DateCreate', { ascending: false });
  if (spreadsError) {
    logger.error(`[spreadService, getSpreadHistory] Ошибка при обращении к spreads для ${telegramId}: ${spreadsError.message}`);
    throw spreadsError;
  }
  const grouped = {};

  for (const spread of spreads) {
    const date = new Date(spread.DateCreate).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    // Добавляем дату, если её ещё нет
    if (!grouped[date]) {
      if (Object.keys(grouped).length >= MAX_DATES) break; // достигли лимита по уникальным датам
      grouped[date] = [];
    }

    // Добавляем расклад в нужную дату
    grouped[date].push({
      id: spread.id,
      Theme: spread.Theme,
      Type: spread.Type,
    });
  }

  return grouped;
}

module.exports = {
  getSpreadHistory,
};


//* Получаем описание расклада и руны
async function getSpreadDetails(spreadId) {
  const { data: spread, error } = await supabase
    .from('spreads')
    .select('Runes, Description')
    .eq('id', spreadId)
    .single();
  if(error) {
    logger.error(`[spreadService, getSpreadDetails] Ошибка при обращении к spreads для ${spreadId} расклада: ${error.message}`);
    throw error;
  }

  return spread;
}

module.exports = {
  getSpreadHistory,
  getSpreadDetails
}