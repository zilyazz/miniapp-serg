const cors = require('cors');
require('dotenv').config();

function normalizeOrigin(value) {
  return String(value || '')
    .trim()
    .replace(/\/$/, '')
    .toLowerCase();
}

function parseAllowlist() {
  const values = [];

  if (process.env.CORS_ORIGIN) {
    values.push(process.env.CORS_ORIGIN);
  }

  if (process.env.CORS_ORIGINS) {
    values.push(...process.env.CORS_ORIGINS.split(','));
  }

  return values
    .map((item) => item.replace(/^["']|["']$/g, ''))
    .map(normalizeOrigin)
    .filter(Boolean);
}

function isTrustedVKOrigin(origin) {
  return /^https:\/\/[a-z0-9-]+\.pages\.vk-apps\.com$/i.test(origin)
    || /^https:\/\/[a-z0-9-]+\.vk-apps\.com$/i.test(origin);
}

const allowlist = parseAllowlist();

module.exports = cors({
  origin(origin, callback) {
    if (!origin) {
      return callback(null, true);
    }

    const normalizedOrigin = normalizeOrigin(origin);
    if (allowlist.includes(normalizedOrigin) || isTrustedVKOrigin(normalizedOrigin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked: ${origin}`));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204,
});
