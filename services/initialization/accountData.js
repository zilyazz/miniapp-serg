const supabase = require('../../supabaseClient');
const logger = require('../../logger');
const { finalizeAccountData } = require('./accountDataCommon');

async function accountData(telegramId, referralParam, realTelegramId, username = null) {
  let refRealId = null;
  if (referralParam && referralParam.startsWith('ref')) {
    const parsed = parseInt(referralParam.replace('ref', ''), 10);
    if (Number.isFinite(parsed) && parsed !== parseInt(realTelegramId, 10)) {
      refRealId = parsed;
    }
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc('init_user_all_v2', {
    p_telegram_mask: String(telegramId).trim().toLowerCase(), // <—
    p_telegram_real: realTelegramId,
    p_referrer_real: refRealId ?? null
  });
  if (rpcError) {
    logger.error(`[accountData] init_user_all RPC error for mask=${telegramId} real=${realTelegramId}: ${rpcError.message}`);
    throw rpcError;
  }

  if (username !== null) {
    const { error: usnikError } = await supabase.rpc('username_sve_upd', {
      p_telegram_real: realTelegramId,
      p_username: username
    });
    if (usnikError) {
      logger.error(`[accountData] username_sve_upd RPC error for mask=${telegramId} real=${realTelegramId}: ${usnikError.message}`);
      throw usnikError;
    }
  }

  const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
  if (!row) throw new Error('init_user_all returned no data');
  return finalizeAccountData(row, telegramId);
}

module.exports = { accountData };
