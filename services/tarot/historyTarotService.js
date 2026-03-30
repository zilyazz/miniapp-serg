const supabase = require('../../supabaseClient');
const logger = require('../../logger');
const {LIMITS} = require('../../utils/constants');

async function openHistoryTarot(telegramId) {
  
  const limit_history_base = LIMITS.TAROT_HISTORY_BASE;
  const limit_history_prem = LIMITS.TAROT_HISTORY_PREM;  
  
  const { data, error } = await supabase.rpc('tarot_history', {
    p_telegram: telegramId,
    p_limit_base: limit_history_base,
    p_limit_premium: limit_history_prem
  });
  
  if(error) {
    logger.error(`[historyTarotService, openHistoryTarot] Ошибка при вызове RPC tarot_history для ${telegramId}: ${error.message}`);
    throw error;
  }

  const grouped = {};

  for (const spread of data || []) {
    const dateKey = new Date(spread.created_at).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    if (!grouped[dateKey]) {
      grouped[dateKey] = [];
    }

    // ищем уже существующую группу по этой сессии внутри даты
    let sessionGroup = grouped[dateKey].find(
      (s) => s.sessionId === spread.session_id
    );

    // если такой ещё нет — создаём
    if (!sessionGroup) {
      sessionGroup = {
        sessionId: spread.session_id,
        items: []
      };
      grouped[dateKey].push(sessionGroup);
    }

    // добавляем сам расклад (основной или продолжение)
    sessionGroup.items.push({
      id: spread.id,
      Theme: spread.theme,
      Type: spread.type
    });
  }

  return grouped;
}

async function getSpreadDetailsTarot(spreadId) {
  const { data: spread, error } = await supabase
    .from('tarot_spreads')
    .select('description')
    .eq('id', spreadId)
    .single();
  if(error) {
    logger.error(`[historyTarotService, getSpreadDetailsTarot] Ошибка при обращении к tarot_spreads для ${spreadId} расклада: ${error.message}`);
    throw error;
  }

  return spread;
}

module.exports = {
  openHistoryTarot,
  getSpreadDetailsTarot
}