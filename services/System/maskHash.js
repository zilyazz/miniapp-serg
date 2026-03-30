//TODO Функция для хэширования

const crypto = require('crypto');

function maskTelegramId(telegramId) {
  const secret = process.env.USER_HASH_SALT;
  if (!secret) {
    const err = new Error('user_hash_salt_missing');
    err.code = 'user_hash_salt_missing';
    throw err;
  }

  if (telegramId == null || telegramId === '') {
    const err = new Error('telegram_id_missing');
    err.code = 'telegram_id_missing';
    throw err;
  }

  return crypto.createHash('sha256')
    .update(telegramId.toString() + secret)
    .digest('hex');
}

module.exports =  maskTelegramId;
