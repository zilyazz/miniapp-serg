const dailyRuneUser = require('../services/initialization/dailyRuneUser');
const accountDataVK = require('../services/initialization/accountDataVK');
const vkInitService = require('../services/auth/vkInitService');
const logger = require('../logger');

const FOR_UPDATE = process.env.FOR_UPDATE === '1' || process.env.FOR_UPDATE === 'true';

module.exports = {
  initVK: async (req, res) => {
    try {
      const { launchParams, referralParam } = req.body || {};
      const { vkId, token, realVkId } = await vkInitService.initVKUser(launchParams);

      if (FOR_UPDATE) {
        return res.status(200).json({ allow: false });
      }

      let acData;
      try {
        acData = await accountDataVK.accountDataVK(vkId, referralParam, realVkId);
      } catch (accountError) {
        accountError.code = accountError.code || 'vk_init_account_data_failed';
        throw accountError;
      }

      let userRune;
      try {
        userRune = await dailyRuneUser.getOrCreateUserRune(acData.userId);
      } catch (runeError) {
        runeError.code = runeError.code || 'vk_init_tarot_day_failed';
        throw runeError;
      }

      const { userId, ...responseData } = acData;
      const baseResponse = {
        token,
        ...responseData,
      };

      if (!userRune.rune) {
        return res.json({
          name: 'Скрытая карта',
          card_key: null,
          interpretation: null,
          ...baseResponse,
        });
      }

      return res.json({
        name: userRune.name,
        card_key: userRune.rune,
        interpretation: userRune.interpretation,
        ...baseResponse,
      });
    } catch (error) {
      logger.error(`VK инициализация: ${error.message}`);

      const code = error?.code || error?.message;
      if (
        code === 'vk_launch_params_missing' ||
        code === 'vk_launch_params_sign_missing' ||
        code === 'vk_launch_params_user_id_missing' ||
        code === 'vk_launch_params_app_id_missing' ||
        code === 'vk_launch_params_app_id_invalid'
      ) {
        return res.status(400).json({ error: code });
      }

      if (
        code === 'vk_launch_params_invalid' ||
        code === 'vk_launch_params_app_id_unexpected'
      ) {
        return res.status(401).json({ error: code });
      }

      if (
        code === 'vk_app_secret_missing' ||
        code === 'vk_app_id_missing' ||
        code === 'jwt_secret_missing' ||
        code === 'auth_user_key_missing' ||
        code === 'user_hash_salt_missing'
      ) {
        return res.status(500).json({ error: code });
      }

      if (
        code === 'vk_init_account_data_failed' ||
        code === 'vk_init_tarot_day_failed' ||
        code === 'vk_init_tarot_day_invalid'
      ) {
        return res.status(500).json({ error: code });
      }

      return res.status(500).json({ error: 'vk_init_failed' });
    }
  },
};
