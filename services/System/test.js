// test.js
const maskTelegramId = require('./maskHash');

const id = process.argv[2] || '886443036';
console.log('USER_HASH_SALT =', process.env.USER_HASH_SALT);
console.log('telegramId     =', id);
console.log('hash           =', maskTelegramId(id));
