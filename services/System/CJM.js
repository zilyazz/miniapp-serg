// services/analytics.js
const supabase = require('../../supabaseClient');

async function logEvent(telegramId, event, ctx = {}) {

  const { data, error } = await supabase.rpc('log_event', {
    p_telegram: String(telegramId),
    p_event: event,
    p_ctx: ctx,
    // p_session_id: не передаем — сервер сам найдёт/создаст
  });
  if (error) throw error;
  return data; // id события
}

module.exports = { logEvent };
