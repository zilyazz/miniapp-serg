const cron = require('node-cron');
const cleanUpSpreadHistory = require('./services/pCleanUpSpreadHistory');
const pBroadcastScheduled = require('./services/System/pBroadcastScheduled'); //Рассылка
const { ensureHoroscopeWindow } = require('./services/horoscope/ensureHoroscopeWindowService'); //Генерация гороскопа

const logger = require('./logger');
require('dotenv').config();

const CRON_ENABLED = process.env.CRON_ENABLED === '1';
let broadcastRunning = false;
let horoscopeRunning = false;

if (CRON_ENABLED) {
// Гороскопы: основной прогон каждый день в 00:05
cron.schedule('0 1-8 * * *', async () => {
//cron.schedule('*/1 * * * *', async () => {  
  if (horoscopeRunning) return;
  horoscopeRunning = true;
  try {
    console.log('Генерим гороскоп...');
    await ensureHoroscopeWindow();
  } catch (e) {
    logger.error('ERROR! ensureHoroscopeWindow:', e.message);
  } finally {
    console.log('Закончили генерацию гороскопа...');
    horoscopeRunning = false;
  }
}, { timezone: 'Europe/Moscow' });

// Очистка неактивных пользователей каждое 1-е число месяца в 02:00
/*
cron.schedule('0 2 1 * *', async () => {
  try{
    await cleanUpSpreadHistory();
  } catch (e) {
    logger.error('ERROR! cleanUpSpreadHistory:', e.message);
  } 
});*/

// Scheduled-рассылка: каждый час в 00 минут
cron.schedule('0 * * * *', async () => {
//cron.schedule('*/1 * * * *', async () => {

    if (broadcastRunning) return;
    broadcastRunning = true;
    
    try {
      console.log('Запуск рассылки');
      await pBroadcastScheduled();
      console.log('Конец рассылки');
    } catch (e) {
      logger.error(`ERROR! pBroadcastScheduled: ${e?.message}`);
    } finally {
      broadcastRunning = false;
    }
  });

console.log('Планировщик заданий запущен');
} else {
  console.log('Планировщик заданий ОТКЛЮЧЕН (CRON_ENABLED!=1)');
}
