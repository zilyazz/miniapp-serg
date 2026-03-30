const supabase = require('../../supabaseClient');
const logger = require('../../logger');

async function changeProfileParam(patch, telegramId) {
  const { data, error } = await supabase.rpc('api_profile_patch', {
    p_telegram: telegramId,
    _patch: patch
  });

  if (error) {
    logger.error(`[changeProfileParamService, changeProfileParam] Ошибка при вызове RPC api_profile_patch: ${error.message}`);
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;
  return row || { ok: true };
}

module.exports = {
  changeProfileParam
};
