const config = require('../config/index');

function authenticate(req, res, next) {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({ error: 'Unauthorized', message: 'API key required' });
  }

  if (apiKey !== config.apiKey) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid API key' });
  }

  next();
}

module.exports = { authenticate };
