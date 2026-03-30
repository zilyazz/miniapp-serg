const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30d';

function issueToken(telegramId) {
  if (!JWT_SECRET) {
    const err = new Error('jwt_secret_missing');
    err.code = 'jwt_secret_missing';
    throw err;
  }

  const token = jwt.sign({ telegramId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

  return {
    token,
  };
}

module.exports = {
  issueToken,
};
