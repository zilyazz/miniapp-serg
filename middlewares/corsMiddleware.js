const cors = require('cors');
const logger = require('../logger');
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
  return /^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.vk-apps\.com$/i.test(origin);
}

function isTrustedNetlifyOrigin(origin) {
  return /^https:\/\/[a-z0-9-]+(?:-[a-z0-9-]+)*\.netlify\.app$/i.test(origin);
}

function isTrustedProjectOrigin(origin) {
  return /^https:\/\/(?:[a-z0-9-]+\.)*astrovesper\.ru$/i.test(origin);
}

const allowlist = parseAllowlist();

module.exports = cors({
  origin(origin, callback) {
    if (!origin) {
      return callback(null, true);
    }

    const normalizedOrigin = normalizeOrigin(origin);
    if (
      allowlist.includes(normalizedOrigin)
      || isTrustedVKOrigin(normalizedOrigin)
      || isTrustedNetlifyOrigin(normalizedOrigin)
      || isTrustedProjectOrigin(normalizedOrigin)
    ) {
      return callback(null, true);
    }

    logger.warn(`[corsMiddleware] blocked origin=${origin}`);
    return callback(null, false);
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204,
});
