const supabase = require('../../supabaseClient');
const logger = require('../../logger');

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

  const userId = String(row.out_user_id);

  // Подписка (может быть null — это ок)
  let subscriptionExpired = false;
  const { data: subscription, error: subError } = await supabase
    .from('subscribe')
    .select('id,date_end')
    .eq('user_id', userId)
    .maybeSingle();
  if (subError) {
    logger.error(`[accountData] subscribe select for ${telegramId}: ${subError.message}`);
    throw subError;
  }
  if (subscription) {
    const now = new Date();
    const untilDate = new Date(subscription.date_end);
    untilDate.setDate(untilDate.getDate() + 1);
    if (now >= untilDate) {
      const { error: delSubError } = await supabase
        .from('subscribe')
        .delete()
        .eq('id', subscription.id);
      if (delSubError) {
        logger.error(`[accountData] subscribe delete for ${telegramId}: ${delSubError.message}`);
        throw delSubError;
      }
      subscriptionExpired = true;
    }
  }

  const { error } = await supabase.rpc('save_tg_source', {
    p_telegram: userId,       // bigint
    p_source: '',         // text
  });

  if (error) {
    logger.error(
      `[accountData, accountData] RPC save_tg_source error telegram=${userId}: ${error.message}`
    );
  }

  return {
    userId,
    score_crystal: row.score_crystal || 0,
    newUserCreated: !!row.is_new,
    subscriptionExpired,
    sound: row.sound || 1,
    allow: true
  };
}

module.exports = { accountData };
