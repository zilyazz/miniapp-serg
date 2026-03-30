
/**
 * 💎 Основные игровые и сервисные константы
 */

module.exports = {
  /** ===========================
   * 🧾 ЦЕНЫ / РАСХОДЫ
   * =========================== */
  PRICES: {
    // Совет от руны дня
    ADVICE_MONET: 200,          // стоимость совета в монетах //! 
    ADVICE_CRYSTAL: 5,           // стоимость совета в кристаллах //! 
    RUNES_LAYOUT_CRYSTAL: 5,
    //Сонник
    SONNIK_MONET: 1600,
    SONNIK_CRYSTAL: 50,
    //Совместимость
    SOVMEST_MONET: 3000,
    SOVMEST_CRYSTAL: 100,
    //Таро
    TAROT_MONET: 3000,
    TAROT_CRYSTAL: 100,
    TAROT_FOLLOWUP_CRYSTAL: 30,
    TAROT_FOLLOWUP_MONET: 1000,
    //Хиромантия
    CHIROMANCY_CRYSTAL: 200,
    //Гороскоп
    HOROSCOPE_PREM_OPEN_CRYSTAL: 20,     // цена открытия premium-контента за день
    HOROSCOPE_PREM_OPEN_MONET: 500,     // цена открытия premium-контента за день
    //Удачный день
    HOROSCOPE_LUCKYDAY_CRYSTAL: 30,
    HOROSCOPE_LUCKYDAY_MONET: 1000,
    HOROSCOPE_FUTURE_DAY_CRYSTAL: 20,
    HOROSCOPE_FUTURE_DAY_MONET: 500,
  },

  /** ===========================
   * 🎁 НАГРАДЫ / БОНУСЫ
   * =========================== */
  REWARDS: {
    //Руны
    RUNES_EXP:3,
    RUNES_COIN:4,
    //Cонник
    SONNIK_EXP_BASE: 10,           //Награда за сонник в виде опыта
    SONNIK_EXP_PREM: 30, 
    //Совместимость
    SOVMEST_EXP_BASE: 10,              //Награда за совместимость в виде опыта
    SOVMEST_EXP_PREM: 30, 
    //Таро
    TAROT_EXP_BASE: 4, //Награда за основной расклад
    TAROT_EXP_PREM: 4, 
    TAROT_COINT: 14,
    TAROT_FOLLOWUP_EXP_BASE: 4, //Награда за продолжение
    TAROT_FOLLOWUP_EXP_PREM: 4, 
    TAROT_FOLLOWUP_COINT: 8,
    //Хирмоантия
    CHIROMANCY_EXP_BASE: 25,
    CHIROMANCY_EXP_PREM: 50,
  },

  /** ===========================
   * ⏳ ОГРАНИЧЕНИЯ / ЛИМИТЫ
   * =========================== */
  LIMITS: {
    LIMIT_DREAMS_BASE: 1, // Лимит на количество обращений к соннику (базовая подписка) за месяц
    LIMIT_DREAMS_PREM: 4, // Лимит на количество обращений к соннику (премиум подписка) за месяц
    LIMIT_HISTORY: 10,     // Лимит на число снов в истории сонника
    //Совместимость
    SOVMEST_LIMIT_BASE: 1,
    SOVMEST_LIMIT_PREAM: 3,
    //Таро
    TAROT_MAIN_BASE_PER_DAY: 1, // Основные расклады таро в день
    TAROT_MAIN_PREM_PER_DAY: 20,
    TAROT_MAIN_WINDOW_HOURS: 24,
    TAROT_FOLLOWUP_BASE: 2,     // Лимит продолжений в день
    TAROT_FOLLOWUP_PREAM: 40,
    TAROT_FOLLOWUP_PER_SESSION: 2, //Лимит на кол-во продолжений в одной сессии
    TAROT_HISTORY_BASE: 5,     // Лимит на число раскладов таро в истории
    TAROT_HISTORY_PREM: 15,

    //Херомантия
    MAX_SIZE_HEROMANT: 10, //Макс размер изображения

    //Руны
    RUNES_LIMIT_BASE: 1,
    RUNES_LIMIT_PREM: 30,
    RUNES_LIMIT_WINDOW_HOURS: 24,
  },
  /** ===========================
   * ⏳ КОНСТАНТЫ ДЛЯ РАССЫЛКИ УВЕДОМЛЕНИЙ
   * =========================== */
  SENDLIMITS: {
    BROADCAST_INTERVAL_DAYS: 2
  },

  HOROSCOPE: {
    LUCKY_TAG_BONUS: 0.25,
    LUCKY_TAG_PENALTY: 0.25,
    LUCKY_MAX_ATTEMPTS: 2,
    BACK_DAYS: 3,
    FUTURE_DAYS: 3,
    LIMIT_HISTORY: 50,
    LIMIT_HISTORY_OFFSET: 0,
    LUCKY_NEURAL_URL: 'http://localhost:8080/api/v1/horoscope/lucky'
  },
  
};
