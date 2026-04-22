const initService = require('../services/initialization/initService');
const vkInitService = require('../services/auth/vkInitService');
const logger = require('../logger');

module.exports = {
  refreshToken: async (req, res) => {
    try {
      const { initData } = req.body || {};
      const { token } = await initService.issueTokenFromInitData(initData);

      return res.status(200).json({
        token,
      });
    } catch (error) {
      logger.error(`[authHandler, refreshToken] ${error.message}`);

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

      return res.status(500).json({ error: 'auth_refresh_failed' });
    }
  },

  refreshVKToken: async (req, res) => {
    try {
      const { launchParams } = req.body || {};
      const { token } = await vkInitService.issueTokenFromLaunchParams(launchParams);

      return res.status(200).json({
        token,
      });
    } catch (error) {
      logger.error(`[authHandler, refreshVKToken] ${error.message}`);

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

      return res.status(500).json({ error: 'auth_vk_refresh_failed' });
    }
  }
};
