const express = require('express');
const helmet = require('helmet');
const TelegramBot = require('node-telegram-bot-api');
const config = require('./config/config');
const corsMiddleware = require('./middlewares/corsMiddleware');
const authMiddleware = require('./middlewares/authMiddleware');

//const botHandlers = require('./handlers/botHandlers');

const router = express.Router();

//  Ограничение запросов в минуту
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 минута
  max: 300, // макс. 100 запросов в минуту с одного IP
  message: "Слишком много запросов. Попробуйте позже."
});

require('dotenv').config(); // Загружаем переменные окружения из .en

const app = express();

// Swagger документация
const { swaggerSpec, swaggerUi } = require('./swagger');
app.use(
  '/docs',
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customCss: `
      /* Весь markdown в описаниях (включая списки) */
      .swagger-ui .opblock-description-wrapper .renderedMarkdown,
      .swagger-ui .opblock-description-wrapper .renderedMarkdown p,
      .swagger-ui .opblock-description-wrapper .renderedMarkdown li {
        font-size: 16px !important;
        color: #eee !important;
        line-height: 1.5 !important;
        font-weight: 500 !important;
        opacity: 1 !important;
      }

      /* Маркеры списков */
      .swagger-ui .opblock-description-wrapper .renderedMarkdown li::marker {
        color: #111 !important;
        opacity: 1 !important;
      }
    `,
  })
);
app.get('/docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

//Оплата криптой
const cryptoPayWebhookHandler = require('./handlers/payment/cryptoPayWebhookHandler');
app.post(
  '/cryptoPayWebhook',
  require('express').raw({ type: 'application/json' }),
  cryptoPayWebhookHandler.handleCryptoPayWebhook
);                                                              

const webhookVKPaymentsHandler = require('./handlers/payment/webhookVKPaymentsHandler');
app.post(
  '/webhooks/vk/payments',
  require('express').text({ type: ['application/json', 'application/x-www-form-urlencoded', 'text/plain'] }),
  webhookVKPaymentsHandler.handleVKPaymentsWebhook
);

app.use(express.json()); // Чтобы сервер понимал JSON
//app.use(limiter);        //! ограниче по запросам в минуту
app.options('*', corsMiddleware); // Обработчик preflight-запросов

const bot = new TelegramBot(config.token, { polling: false });

//Покупка кристаллов 
const paymentWebhookHandlerTGBot = require('./handlers/payment/webhookTGBotHandler');
app.post('/webhook', (req, res) => paymentWebhookHandlerTGBot.handleWebhook(req, res, bot));  

app.use(helmet());
app.use(corsMiddleware); // Подключаем CORS middleware

// Генерация раскладов
const apiHandlers = require('./handlers/apiHandlers');
app.post('/generate',authMiddleware, apiHandlers.generateLayout);    //✅            
const layoutLimit = require('./handlers/layoutLimitHandler');
app.post('/layoutAllowed',authMiddleware, layoutLimit.checkCountLayout); //Проверка можно ли делать расклад (layout)    //✅  

//История раскладов рунических
const spreadHandler = require('./handlers/spreadHandler');
app.get('/spread/history', authMiddleware, spreadHandler.getSpreadHistory);  //✅     
app.get('/spread/details/:spreadId', spreadHandler.getSpreadDetails);       //✅     

//Инициализация + переворот руны
const authHandler = require('./handlers/authHandler');
const initUserDailyRuneHandler = require('./handlers/initUserDailyRuneHandler');
const vkInitHandler = require('./handlers/vkInitHandler');
app.post('/initUserDailyRuneHandler', initUserDailyRuneHandler.getDailyRune);   //✅     
app.post('/auth/refresh', authHandler.refreshToken); //✅     
app.post('/vk/init', vkInitHandler.initVK); //✅
app.post('/auth/vk/refresh', authHandler.refreshVKToken); //✅
const flipRune = require('./handlers/flipRuneHandler');
app.post('/flipRune', authMiddleware,flipRune.flipRune);  //✅     

//Профиль
const profileMenu = require('./handlers/profile/profileHandler');
app.get('/profile', authMiddleware, profileMenu.profileMenu);            //✅    
app.post('/profile/addParam', authMiddleware, profileMenu.addProfileParam);  //✅    
app.post('/profile/changeParam', authMiddleware, profileMenu.changeProfileParam);  //✅    

//Подписка
const subscribe = require('./handlers/subscribe/subscribehandler');
app.get('/subscribe', subscribe.subcribe);                                //✅     
//const sub = require('./handlers/subscribe/subcribeCheckHandler');
//app.get('/subscription', authMiddleware, sub.subcribeCheck);          
const subscribeBuy = require('./handlers/subscribe/subscribeBuyHandler'); 
app.post('/subscribe/buy', authMiddleware, subscribeBuy.subscribeBuyCrystal);   //✅     
//const inventory = require('./handlers/inventory/openInventory');
//app.get('/openInventory', authMiddleware, inventory.getInventory);

//Польз. соглаш.
const terms = require('./handlers/politicAcceptedHandler');
app.get('/politicalAcc/:telegramId', terms.termAccepted);      //✅         

//Покупка кристаллов со скидками
/*
const buyCrystal = require('./handlers/crystalBuyHandler');
app.get('/buyCrystal/price', authMiddleware, buyCrystal.getInfoCrystal)
*/

//Системные
const systemHandl = require('./handlers/SystemFunctionHandler');  
//app.post('/system/crystal', authMiddleware, systemHandl.checkCrystalUser)      //Обновленное кол-во кристаллов юзера (после покупки)
//const initNew = require('./handlers/~initNew');
//app.post('/init',initNew.getDailyRune)      
app.get('/crystalMoney',systemHandl.crystalPrice); //Кристаллы за рубли (варианты покупки)  //✅     
app.get('/crystalStars',systemHandl.starsCrystalPrice); //Кристаллы за звезды (варианты покупки)  //✅     
app.get('/crystalVKVotes',systemHandl.vkVotesCrystalPrice); //Кристаллы за голоса VK //✅
app.post('/sound', authMiddleware,systemHandl.updSound); //Включение или выключение звука //✅     
const paymentStatus = require('./handlers/payment/paymentStatusHandler'); 
app.post('/checkPayment', authMiddleware, paymentStatus.statPayment);        

//Оплата через бота (кристаллы)
const paymentHandlerTGBot = require('./handlers/payment/paymentTGBotHandler');
const paymentHandlerVK = require('./handlers/payment/paymentVKHandler');
app.post('/createInvoice', authMiddleware,paymentHandlerTGBot.createCrystalPayment);  
app.post('/createInvoiceStars', authMiddleware, paymentHandlerTGBot.createCrystalPaymentStars); //звезды  
app.post('/createInvoiceCrypto',  authMiddleware, paymentHandlerTGBot.createCrystalPaymentCrypto);  //крипты
app.post('/createInvoiceVKVotes',  authMiddleware, paymentHandlerVK.createCrystalPaymentVKVotes);  // голоса VK


//Таро
const tarot = require('./handlers/tarotHandler');
app.get('/tarot/check', authMiddleware,tarot.openAndCheckLimitsTarot);      //✅   
app.post('/tarot/open', authMiddleware,tarot.checkPay);                   //✅     
app.post('/tarot/generate', authMiddleware,tarot.createInetrpTator);        //✅   
app.post('/tarot/generate/pay', authMiddleware,tarot.createInetrpTatorPay);   //✅   
app.post('/tarot/generate/follow', authMiddleware,tarot.createFollowupInetrpTator);    //✅   
app.post('/tarot/generate/follow/pay', authMiddleware,tarot.createFollowupPayInetrpTator);   //✅   
app.get('/tarot/history', authMiddleware,tarot.historyTarot);                   //✅  
app.post('/tarot/history/details',authMiddleware,tarot.historyTarotDetails);    //✅  

//Гороскоп
const horoscope = require('./handlers/horoscopeHandler');
app.post('/horoscope/open', authMiddleware, horoscope.openHoroscope); //открытие дня  //✅    
app.post('/horoscope/buyHoroscopeFull', authMiddleware, horoscope.buyPremHoroscope); //покупка полного гроскопа  //✅    
app.post('/horoscope/buyFutureHoroscope', authMiddleware, horoscope.buyFutureHoroscope); //покупка будущего дня  //✅    
app.post('/horoscope/luckyDay', authMiddleware, horoscope.pickLuckyDay); //удачный день  //✅    
app.post('/horoscope/lucky/history', authMiddleware, horoscope.luckyDayHistoryList);  //✅    



require('./cronJob'); 
// Запуск сервера /*
app.listen(config.port, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${config.port}`);
}); 
