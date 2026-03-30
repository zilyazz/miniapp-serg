
const cors = require('cors');
require('dotenv').config();

module.exports = cors({
  origin: process.env.CORS_ORIGIN, // Укажи свой домен
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});
/*
const cors = require('cors');
require('dotenv').config();

const allowlist = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)
  .map(s => s.replace(/^["']|["']$/g, ''))   // снять внешние кавычки, если вдруг есть
  .map(s => s.replace(/\/$/, ''))            // убрать слэш в конце
  .map(s => s.toLowerCase());                // origin сравниваем в нижнем регистре

module.exports = cors({
  origin(origin, cb) {
    // Разрешаем сервер/постман без Origin
    if (!origin) return cb(null, true);
    const o = origin.replace(/\/$/, '').toLowerCase();
    if (allowlist.includes(o)) return cb(null, true);
    return cb(new Error(`CORS blocked: ${origin}`));
  },
  methods: ['GET','POST','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
});
*/
