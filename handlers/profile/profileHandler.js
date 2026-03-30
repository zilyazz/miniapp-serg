//TODO Меню профиля 

const profile = require('../../services/profile/profileService');
const addProfileParamService = require('../../services/profile/addProfileParamService');
const changeProfileParamService = require('../../services/profile/changeProfileParamService');
const { buildProfilePatch } = require('../../services/profile/buildProfilePatch');
const logger = require('../../logger');

module.exports = {
  profileMenu: async(req,res) => {
    try{
      const telegramId = req.telegramId;
      //logger.info(`[profileHandler, profileMenu] Открытие профиля для telegramId=${telegramId}`);
      const profileResult =  await profile.profileMenu(telegramId);

      res.status(200).json(profileResult);
    } catch(error) {
      logger.error(`[profileHandler, profileMenu] Ошибка: ${error.message}`)
      res.status(500).json({error: error.message});
    }
  },
  addProfileParam: async(req, res) => {
    try {
      const telegramId = req.telegramId;
      const { name, sex, birth_date, birth_time_str, has_exact_time, place_name, lat, lon, tz_name } = req.body;

      const payload = {
        telegramId,
        name,
        sex,
        birth_date,
        birth_time_str,
        has_exact_time: !!has_exact_time,
        place_name,
        lat: Number(lat),
        lon: Number(lon),
        tz_name
      };

      const result = await addProfileParamService.upsertBirthProfileFromClient(payload);
      res.status(200).json(result);
    } catch (error) {
      logger.error(`[profileHandler, addProfileParam] Ошибка: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  },
  changeProfileParam: async(req, res) => {
    try {
      const telegramId = req.telegramId;
      const patch = buildProfilePatch(req.body);

      const result = await changeProfileParamService.changeProfileParam(patch, telegramId);
      res.status(200).json(result);
    } catch (error) {
      logger.error(`[profileHandler, changeProfileParam] Ошибка: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  }
}
