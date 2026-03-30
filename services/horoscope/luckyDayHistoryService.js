// services/horoscope/luckyDayHistoryService.js
const supabase = require('../../supabaseClient');
const logger = require('../../logger');
const { HOROSCOPE } = require('../../utils/constants');

function groupByCreatedDate(rows) {
  const groupsMap = new Map(); // date -> items[]

  for (const r of rows) {
    const createdAt = r.created_at ? new Date(r.created_at) : null;
    const dateKey = createdAt ? createdAt.toISOString().slice(0, 10) : 'unknown';

    if (!groupsMap.has(dateKey)) groupsMap.set(dateKey, []);
    groupsMap.get(dateKey).push({
      id: r.id,
      created_at: r.created_at,
      query_ru: r.query_ru,
      range_days: r.range_days,
      best_day: r.best_day,
      top3: Array.isArray(r.top_days) ? r.top_days.slice(0, 3) : (r.top_days ?? []),
      best_text_ru: r.best_text_ru
    });
  }

  // в массив, сортировка по дате (desc), внутри группы — по created_at (desc)
  const grouped = Array.from(groupsMap.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, items]) => ({
      date,
      items: items.sort((x, y) => (x.created_at < y.created_at ? 1 : -1))
    }));

  return grouped;
}

async function listLuckyHistory(telegramId, limit = 50, offset = 0) {
  const lim = Math.min(Math.max(Number(HOROSCOPE.LIMIT_HISTORY) || 50, 1), 100);
  const off = Math.max(Number(HOROSCOPE.LIMIT_HISTORY_OFFSET) || 0, 0);

  const { data, error } = await supabase.rpc('horoscope_lucky_history_list', {
    p_telegram: telegramId,
    p_limit: lim,
    p_offset: off
  });

  if (error) {
    logger.error(`[luckyDayHistoryService, listLuckyHistory] RPC horoscope_lucky_history_list error telegram=${telegramId}: ${error.message}`);
    throw error;
  }

  const rows = Array.isArray(data) ? data : [];
  return {
    ok: true,
    groups: groupByCreatedDate(rows)
  };
}

module.exports = {
  listLuckyHistory
};
