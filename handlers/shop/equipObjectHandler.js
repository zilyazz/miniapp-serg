//TODO Хендлер для надевание предмета
const equipObj = require('../../services/shop/equipObjectService');
const logger = require('../../logger');

module.exports = {
  getInventory: async (req,res) => {
    try{
      const {item_id} = req.body;
      const telegramId = req.telegramId;

      //logger.info(`[equipObjectHandler, getInventory] Начинаем экипировку item_id=${item_id} для telegramId=${telegramId}`);
      const equip = await equipObj.equipObject(telegramId,item_id);
      //logger.info(`[equipObjectHandler, getInventory] Успешно экипирован item_id=${item_id} для telegramId=${telegramId}`);

      return res.status(200).json(equip);

    } catch (error) {
        logger.error(`[equipObjectHandler, getInventory] Ошибка: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
  }
}