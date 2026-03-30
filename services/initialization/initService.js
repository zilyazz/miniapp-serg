//TODO Функция для проверки initData и генерации токена (без хэндлера, работает ТОЛЬКО при инициализации) 

const crypto = require('crypto');
const maskTelegramId = require('../../services/System/maskHash');
const tokenService = require('../auth/tokenService');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const MAX_INITDATA_AGE_SEC = Number(process.env.MAX_INITDATA_AGE_SEC || 24 * 60 * 60);
const MAX_INITDATA_FUTURE_SKEW_SEC = Number(process.env.MAX_INITDATA_FUTURE_SKEW_SEC || 5 * 60);

// Проверка подписи (hash) initData
function checkInitData(initData) {
  if (!BOT_TOKEN) {
    const err = new Error('telegram_bot_token_missing');
    err.code = 'telegram_bot_token_missing';
    throw err;
  }

  if (!initData || typeof initData !== 'string') {
    const err = new Error('initdata_missing');
    err.code = 'initdata_missing';
    throw err;
  }

  const normalizedInitData = initData.trim();
  const parsed = new URLSearchParams(normalizedInitData);
  const hash = parsed.get('hash');
  const authDateRaw = parsed.get('auth_date');

  if (!hash) {
    const err = new Error('initdata_hash_missing');
    err.code = 'initdata_hash_missing';
    throw err;
  }

  const authDate = Number(authDateRaw);
  if (!authDate || Number.isNaN(authDate)) {
    const err = new Error('initdata_auth_date_missing');
    err.code = 'initdata_auth_date_missing';
    throw err;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (authDate > nowSec + MAX_INITDATA_FUTURE_SKEW_SEC) {
    const err = new Error('initdata_invalid');
    err.code = 'initdata_invalid';
    throw err;
  }
  if (nowSec - authDate > MAX_INITDATA_AGE_SEC) {
    const err = new Error('initdata_expired');
    err.code = 'initdata_expired';
    throw err;
  }

  parsed.delete('hash');
  //parsed.delete('signature');

  const dataCheckString = [...parsed.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  if (calculatedHash !== hash) {
    const err = new Error('initdata_invalid');
    err.code = 'initdata_invalid';
    throw err;
  }

  const userJSON = parsed.get('user');
  if (!userJSON) {
    const err = new Error('initdata_user_missing');
    err.code = 'initdata_user_missing';
    throw err;
  }

  //const user = JSON.parse(decodeURIComponent(userJSON));
  let user;
  try {
    user = JSON.parse(userJSON); // ✅ URLSearchParams уже вернул декодированное значение
  } catch (e) {
    // на случай если вдруг user пришёл ещё закодированным (редко)
    try {
      user = JSON.parse(decodeURIComponent(userJSON));
    } catch (decodeError) {
      const err = new Error('initdata_user_invalid');
      err.code = 'initdata_user_invalid';
      throw err;
    }
  }

  return user;
}

// Главная функция: проверяет initData, генерит токен и возвращает нужные данные
async function initUser(initData) {
  const user = checkInitData(initData);
  const realTelegramId  = user.id;

  if (!realTelegramId) {
    const err = new Error('initdata_user_id_missing');
    err.code = 'initdata_user_id_missing';
    throw err;
  }

  const telegramId = maskTelegramId(realTelegramId);
  const { token } = tokenService.issueToken(telegramId);

  return {
    telegramId,
    token,
    realTelegramId,
    username: user.username ?? null,
  };
}

async function issueTokenFromInitData(initData) {
  const { token } = await initUser(initData);
  return { token };
}

module.exports = {
  initUser,
  issueTokenFromInitData,
};
