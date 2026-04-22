const supabase = require('../../supabaseClient');
const logger = require('../../logger');
const { finalizeAccountData } = require('./accountDataCommon');

async function accountDataVK(userKey, referralParam, realVkId) {
  let refVkId = null;
  if (referralParam && referralParam.startsWith('ref')) {
    const parsed = parseInt(referralParam.replace('ref', ''), 10);
    if (Number.isFinite(parsed) && parsed !== parseInt(realVkId, 10)) {
      refVkId = parsed;
    }
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc('init_user_all_vk_v1', {
    p_vk_mask: String(userKey).trim().toLowerCase(),
    p_vk_real: realVkId,
    p_referrer_vk_real: refVkId ?? null,
  });

  if (rpcError) {
    logger.error(`[accountDataVK] init_user_all_vk_v1 RPC error for key=${userKey} real=${realVkId}: ${rpcError.message}`);
    throw rpcError;
  }

  const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
  return finalizeAccountData(row, userKey);
}

module.exports = {
  accountDataVK,
};
