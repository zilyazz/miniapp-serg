// handlers/horoscopeLuckyDayHandler.js
const logger = require('../logger');
const openHoroscope = require('../services/horoscope/openDayHoroscopeService');
const luckyDayService = require('../services/horoscope/luckyDayService');
const buyPremHoroscope = require('../services/horoscope/buyPremHoroscopeService');
const buyFutureHoroscope = require('../services/horoscope/buyFutureHoroscopeService');
const luckyDayHistoryService = require('../services/horoscope/luckyDayHistoryService');

module.exports = {
  openHoroscope: async (req, res) => {
    try {
      const telegramId = req.telegramId;
      const { day } = req.body;

      const result = await openHoroscope.openDayHoroscope(telegramId,day);
      return res.status(200).json(result);
    } catch (e) {
      logger.error(`[horoscopeHandler, openHoroscope] error: ${e.message}`);
      return res.status(500).json({ error: e.message });
    }
  },
  buyPremHoroscope: async (req, res) => {
    try {
      const telegramId = req.telegramId;
      const { day } = req.body;

      const result = await buyPremHoroscope.buyPremHoroscope(telegramId,day);

      if (result?.ok !== false) {
        return res.status(200).json(result);
      } else {
        // мэпим коды на HTTP, чтобы фронту было проще
        const code = result.code;
        if (code === 'not_enough_crystals' || code === 'not_enough_coins') {
          return res.status(402).json({ error: code, price: result.price }); // 402 Payment Required
        }
        if (code === 'bad_request') {
          return res.status(400).json({ error: code });
        }
        return res.status(500).json({ error: code || 'internal_error' });
      }
    } catch (e) {
      logger.error(`[horoscopeHandler, buyPremHoroscope] error: ${e.message}`);
      return res.status(500).json({ error: e.message });
    }
  },
  buyFutureHoroscope: async (req, res) => {
    try {
      const telegramId = req.telegramId;
      const { day } = req.body;

      const result = await buyFutureHoroscope.buyFutureHoroscope(telegramId,day);

      if (result?.ok !== false) {
        return res.status(200).json(result);
      } else {
        // мэпим коды на HTTP, чтобы фронту было проще
        const code = result.code;
        if (code === 'not_enough_crystals' || code === 'not_enough_coins') {
          return res.status(402).json({ error: code, price: result.price }); // 402 Payment Required
        }
        if (code === 'bad_request') {
          return res.status(400).json({ error: code });
        }
        return res.status(500).json({ error: code || 'internal_error' });
      }
    } catch (e) {
      logger.error(`[horoscopeHandler, buyFutureHoroscope] error: ${e.message}`);
      return res.status(500).json({ error: e.message });
    }
  },
  pickLuckyDay: async (req, res) => {
    try {
      const telegramId = req.telegramId;
      const { query, range_days } = req.body;

      const result = await luckyDayService.pickLuckyDay(telegramId, query, range_days);
      if (result?.ok !== false) {
        return res.status(200).json(result);
      } else {
        // мэпим коды на HTTP, чтобы фронту было проще
        const code = result.code;
        if (code === 'not_enough_crystals' || code === 'not_enough_coins') {
          return res.status(402).json({ error: code, price: result.price }); // 402 Payment Required
        }
        if (code === 'bad_request' || code === 'bad_currency') {
          return res.status(400).json({ error: code });
        }
        if (code === 'horoscope_failed') {
          return res.status(502).json({ error: code });
        }
        return res.status(500).json({ error: code || 'internal_error' });
      }
    } catch (e) {
      logger.error(`[horoscopeHandler, pickLuckyDay] error: ${e.message}`);
      return res.status(500).json({ error: e.message });
    }
  },
  luckyDayHistoryList: async (req, res) => {
    try {
      const telegramId = req.telegramId;

      const result = await luckyDayHistoryService.listLuckyHistory(telegramId);
      return res.status(200).json(result);
    } catch (e) {
      logger.error(`[horoscopeHandler, luckyDayHistoryList] error: ${e.message}`);
      return res.status(500).json({ error: 'internal_error' });
    }
  },
};
