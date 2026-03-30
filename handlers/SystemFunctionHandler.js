const crystalPrice = require ('../services/System/crystalBuyTableService');
const crystalPriceStars = require ('../services/System/crystalBuyTableService');
const updSound = require('../services/System/updSoundService');
const logger = require('../logger');

module.exports = {
  crystalPrice: async(req,res) => {
    try{
      const crystals = await crystalPrice.crystalMoney();
      res.json(crystals);
    } catch (error) {
        logger.error(`[SystemFunctionHandler, crystalPrice] Ошибка: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
  },
  updSound: async(req,res) => {
    try{
      const telegramId = req.telegramId;
      const{sound} = req.body;
      const result = await updSound.updSoundUser(telegramId, sound);
      res.json(result);
    } catch (error) {
        logger.error(`[SystemFunctionHandler, updSound] Ошибка: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
  },
  starsCrystalPrice: async(req,res) => {
    try{
      const crystals = await crystalPriceStars.crystalStars();
      res.json(crystals);
    } catch (error) {
        logger.error(`[SystemFunctionHandler, starsCrystalPrice] Ошибка: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
  },
  /*
  checkCrystalUser: async(req,res) => {
    try{
      const telegramId = req.telegramId;
      const crystal = await checkCrystalAfterBuy.crystalAfterBuyCrystal(telegramId);
      res.json(crystal);
    } catch (error) {
        logger.error(`[SystemFunctionHandler, checkCrystalUser] Ошибка: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
  }
    */
}
