const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;

module.exports = function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'auth_token_missing' });
  }

  if (typeof authHeader !== 'string') {
    return res.status(401).json({ error: 'auth_token_missing' });
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();

  if (!token) {
    return res.status(401).json({ error: 'auth_token_missing' });
  }

  if (!JWT_SECRET) {
    return res.status(500).json({ error: 'auth_config_invalid' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded?.telegramId || typeof decoded.telegramId !== 'string') {
      return res.status(401).json({ error: 'auth_token_invalid' });
    }
    req.telegramId = decoded.telegramId;
    next();
  } catch (error) {
    console.error('Ошибка при верификации токена:', error.message);

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'auth_token_expired' });
    }

    return res.status(401).json({ error: 'auth_token_invalid' });
  }
};
