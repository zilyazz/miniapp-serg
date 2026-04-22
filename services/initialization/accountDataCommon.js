const supabase = require('../../supabaseClient');
const logger = require('../../logger');

async function finalizeAccountData(row, internalUserKey) {
  if (!row) {
    throw new Error('init_user_all returned no data');
  }

  const userId = String(row.out_user_id);

  let subscriptionExpired = false;
  const { data: subscription, error: subError } = await supabase
    .from('subscribe')
    .select('id,date_end')
    .eq('user_id', userId)
    .maybeSingle();

  if (subError) {
    logger.error(`[accountDataCommon] subscribe select for ${internalUserKey}: ${subError.message}`);
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
        logger.error(`[accountDataCommon] subscribe delete for ${internalUserKey}: ${delSubError.message}`);
        throw delSubError;
      }

      subscriptionExpired = true;
    }
  }

  const { error: sourceError } = await supabase.rpc('save_tg_source', {
    p_telegram: userId,
    p_source: '',
  });

  if (sourceError) {
    logger.error(
      `[accountDataCommon] RPC save_tg_source error user=${userId} key=${internalUserKey}: ${sourceError.message}`
    );
  }

  return {
    userId,
    score_crystal: row.score_crystal || 0,
    newUserCreated: !!row.is_new,
    subscriptionExpired,
    sound: row.sound || 1,
    allow: true,
  };
}

module.exports = {
  finalizeAccountData,
};
