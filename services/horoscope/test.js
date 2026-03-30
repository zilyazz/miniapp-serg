// scripts/runHoroscopeEnsure.js
require('dotenv').config();
const logger = require('../../logger');
const { ensureHoroscopeWindow } = require('./ensureHoroscopeWindowService');

(async () => {
  try {
    const res = await ensureHoroscopeWindow();
    console.log('OK', res);
    process.exit(0);
  } catch (e) {
    logger.error(`[runHoroscopeEnsure] failed: ${e?.message}`);
    console.error(e);
    process.exit(1);
  }
})();
