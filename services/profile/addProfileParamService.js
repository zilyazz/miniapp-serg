const supabase = require('../../supabaseClient');

async function upsertBirthProfileFromClient(payload) {
  const { data, error } = await supabase.rpc('birth_profile_upsert_from_client', {
    p_telegram: payload.telegramId,
    p_name: payload.name,
    p_sex: payload.sex,
    p_birth_date: payload.birth_date,
    p_birth_time_str: payload.birth_time_str,
    p_has_exact_time: payload.has_exact_time,
    p_place_name: payload.place_name,
    p_lat: payload.lat,
    p_lon: payload.lon,
    p_tz_name: payload.tz_name
  });

  if (error) {
    const msg = error.message || '';
    if (msg.includes('invalid_payload')) throw new Error('bad_request');
    if (msg.includes('invalid_tz') || msg.includes('unknown_tz_name')) throw new Error('bad_timezone');
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;

  return row || { ok: true };
}

module.exports = {
  upsertBirthProfileFromClient
};
