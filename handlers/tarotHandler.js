//TODO Таро

const getLimitTarot = require('../services/tarot/limitTarotService');
const getCardTarotAndCheckPay = require('../services/tarot/createCardAndCheckPay');
const createInterprTarotService = require('../services/tarot/createInterprTarotService');
const createPayInterprTarotService = require('../services/tarot/createPayInterprTarotService');
const createFollowupInterprTarotService = require('../services/tarot/followupTarotService');
const historyTarotService = require('../services/tarot/historyTarotService');
const logger = require('../logger');

module.exports = {

  // Проверяем лимит (первое нажатие)
  openAndCheckLimitsTarot: async(req,res) => {
    try{
      const telegramId = req.telegramId;
      //const{telegramId} =req.body
      const result =  await getLimitTarot.getLimitTarot(telegramId);

      res.status(200).json(result);
    } catch(error) {
      logger.error(`[tarotHandler, openAndCheckLimitsTarot] Ошибка: ${error.message}`);
      res.status(500).json({error: error.message});
    }
  },
  // Проверяем надо ли платить и генерим карты (второе нажатие)
  checkPay: async(req,res) => {
    try{
      const{type} =req.body
      const telegramId = req.telegramId;
      //const{telegramId} =req.body
      const resultCheck = await  getCardTarotAndCheckPay.getCardTarotAndCheckPay(telegramId, type)
      res.status(200).json(resultCheck);
    } catch(error) {
      logger.error(`[tarotHandler, checkPay] Ошибка: ${error.message}`);
      res.status(500).json({error: error.message});
    }
  },
  createInetrpTator: async(req,res) => {
    try{
      const{type, key, question} =req.body
      const telegramId = req.telegramId;
      //const{telegramId} =req.body
      const resulInter = await  createInterprTarotService.createInterprTarot(telegramId, type, key, question)
      if (resulInter?.ok !== false) {
      res.status(200).json(resulInter);
      } else {
        const code = resulInter.code;

        if (code === 'tarot_failed') {
          return res.status(502).json({ error: code });
        }
        return res.status(500).json({ error: code || 'internal_error' });
      }
    } catch(error) {
      logger.error(`[tarotHandler, createInetrpTator] Ошибка: ${error.message}`);
      res.status(500).json({error: error.message});
    }
  },
  createInetrpTatorPay: async(req,res) => {
    try{
      const{theme, type, key, question} =req.body
      const telegramId = req.telegramId;
      //const{telegramId} =req.body
      const resulInterPay = await  createPayInterprTarotService.createPayInterprTarot(telegramId, type, key, question)

      if (resulInterPay?.ok !== false) {
        return res.status(200).json(resulInterPay);
      } else {
        // мэпим коды на HTTP, чтобы фронту было проще
        const code = resulInterPay.code;
        if (code === 'not_enough_crystals' || code === 'not_enough_coins') {
          return res.status(402).json({ error: code, price: resulInterPay.price }); // 402 Payment Required
        }
        if (code === 'bad_request' || code === 'bad_currency') {
          return res.status(400).json({ error: code });
        }
        if (code === 'bad_state') {
          return res.status(409).json({ error: code });
        }
        if (code === 'tarot_failed') {
          return res.status(502).json({ error: code });
        }
        return res.status(500).json({ error: code || 'internal_error' });
      }
    } catch(error) {
      logger.error(`[tarotHandler, createInetrpTatorPay] Ошибка: ${error.message}`);
      res.status(500).json({error: error.message});
    }
  },
  createFollowupPayInetrpTator: async(req,res) => {
    try{
      const{sessionId, question} =req.body
      const telegramId = req.telegramId;
      //const{telegramId} =req.body
      const resulInterPay = await  createFollowupInterprTarotService.createPayFollowupTarot(telegramId, sessionId, question)
      if (resulInterPay?.ok !== false) {
        res.status(200).json(resulInterPay);
      } else {
        // мэпим коды на HTTP, чтобы фронту было проще
        const code = resulInterPay.code;
        if (code === 'not_enough_crystals' || code === 'not_enough_coins') {
          return res.status(402).json({ error: code, price: resulInterPay.price }); // 402 Payment Required
        }
        if (code === 'bad_request' || code === 'bad_currency') {
          return res.status(400).json({ error: code });
        }
        if (code === 'bad_state') {
          return res.status(409).json({ error: code });
        }
        if (code === 'tarot_failed') {
          return res.status(502).json({ error: code });
        }
        return res.status(500).json({ error: code || 'internal_error' });
      }
    } catch(error) {
      logger.error(`[tarotHandler, createInetrpTator] Ошибка: ${error.message}`);
      res.status(500).json({error: error.message});
    }
  },
  createFollowupInetrpTator: async(req,res) => {
    try{
      const{sessionId, question} =req.body
      const telegramId = req.telegramId;
      //const{telegramId} =req.body
      const resulInter = await  createFollowupInterprTarotService.createFollowupTarot(telegramId, sessionId, question)
      if (resulInter?.ok !== false) {
        res.status(200).json(resulInter);
      } else {
      const code = resulInter.code;

      if (code === 'tarot_followup_failed') {
        return res.status(502).json({ error: code });
      }
      return res.status(500).json({ error: code || 'internal_error' });
      }
    } catch(error) {
      logger.error(`[tarotHandler, createInetrpTator] Ошибка: ${error.message}`);
      res.status(500).json({error: error.message});
    }
  },
  historyTarot: async(req,res) => {
    try{
      const telegramId = req.telegramId;
      //const{telegramId} =req.body
      const result =  await historyTarotService.openHistoryTarot(telegramId);

      res.status(200).json(result);
    } catch(error) {
      logger.error(`[tarotHandler, historyTarot] Ошибка: ${error.message}`);
      res.status(500).json({error: error.message});
    }
  },  
  historyTarotDetails: async(req,res) => {
    try{
      const {spreadId} = req.body;
      //const{telegramId, spreadId} =req.body
      const result =  await historyTarotService.getSpreadDetailsTarot(spreadId);

      res.status(200).json(result);
    } catch(error) {
      logger.error(`[tarotHandler, historyTarotDetails] Ошибка: ${error.message}`);
      res.status(500).json({error: error.message});
    }
  },  
}