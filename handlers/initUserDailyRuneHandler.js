//TODO Инициализация пользователя, получение необходимых данных для гл. меню

const dailyRuneUser = require('../services/initialization/dailyRuneUser');
const accountData = require('../services/initialization/accountData');
const initService = require('../services/initialization/initService');
const { isDeveloper } = require('../services/initialization/maintenanceGate');
const logger = require('../logger');

const FOR_UPDATE = process.env.FOR_UPDATE === '1' || process.env.FOR_UPDATE === 'true';

module.exports = {
  getDailyRune: async (req,res) => {
    try {
      const {initData,referralParam }  = req.body;
      //logger.info('Начало проверки инициализации')
      const { telegramId, token, realTelegramId, username } = await initService.initUser(initData);

      //MAINTENANCE GATE
      if (FOR_UPDATE) {
        const okDev = await isDeveloper(realTelegramId);
        if (!okDev) {
          return res.status(200).json({
            allow: false,
          });
        }
      }

      let acData;
      try {
        acData = await accountData.accountData(telegramId,referralParam,realTelegramId, username);
      } catch (accountError) {
        accountError.code = accountError.code || 'init_account_data_failed';
        throw accountError;
      }
      let userRune;
      try {
        userRune = await dailyRuneUser.getOrCreateUserRune(acData.userId);
      } catch (runeError) {
        runeError.code = runeError.code || 'init_tarot_day_failed';
        throw runeError;
      }
      //console.log("🚀 ~ userRune:", userRune)
      const { userId, ...responseData } = acData; //деструктуризация чтобы не выводил userId в return
      const baseResponse = {
        token,          // 👈 Отправляем на фронт
        ...responseData // crystals, xp и т.д.
      };
      //console.log("🚀 ~ baseResponse:", baseResponse)
      
      if (!userRune.rune) {
        return res.json({
          name: 'Скрытая карта',
          card_key: null,
          interpretation: null,
          ...baseResponse
        });
      }

      return res.json({
        name: userRune.name,
        card_key: userRune.rune,
        interpretation: userRune.interpretation,
        ...baseResponse
      });
    } catch (error) {
      logger.error(`Инициализация: ${error.message}`);

      const code = error?.code || error?.message;
      if (
        code === 'initdata_missing' ||
        code === 'initdata_hash_missing' ||
        code === 'initdata_auth_date_missing' ||
        code === 'initdata_user_missing' ||
        code === 'initdata_user_invalid' ||
        code === 'initdata_user_id_missing'
      ) {
        return res.status(400).json({ error: code });
      }

      if (code === 'initdata_expired' || code === 'initdata_invalid') {
        return res.status(401).json({ error: code });
      }

      if (
        code === 'telegram_bot_token_missing' ||
        code === 'jwt_secret_missing' ||
        code === 'auth_user_key_missing' ||
        code === 'user_hash_salt_missing'
      ) {
        return res.status(500).json({ error: code });
      }

      if (code === 'init_account_data_failed' || code === 'init_tarot_day_failed' || code === 'init_tarot_day_invalid') {
        return res.status(500).json({ error: code });
      }

      res.status(500).json({ error: 'init_failed' });
    }
  },
}
