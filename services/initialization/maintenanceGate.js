// services/initialization/maintenanceGate.js
const supabase = require('../../supabaseClient');
const logger = require('../../logger');

async function isDeveloper(realTelegramId) {
  // Защита от мусора
  const idNum = Number(realTelegramId);
  if (!Number.isFinite(idNum)) return false;

  const { data, error } = await supabase
    .from('dev_allowlist')
    .select('telegram_real_id')
    .eq('telegram_real_id', idNum)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    logger.error(`[maintenanceGate] dev_allowlist select error: ${error.message}`);
    // На твой вкус:
    // 1) fail-open (впускать, чтобы не сломать прод)
    // 2) fail-closed (никого не впускать)
    // Я бы для безопасности обновления сделал fail-open:
    return true;
  }

  return !!data;
}

module.exports = { isDeveloper };
