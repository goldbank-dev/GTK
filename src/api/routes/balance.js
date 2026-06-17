const { Router } = require('express');
const blockchainService = require('../services/blockchainService');
const { authenticate } = require('../middleware/auth');

const router = Router();

router.get('/:address', authenticate, async (req, res, next) => {
  try {
    const balance = await blockchainService.getBalance(req.params.address);
    res.json(balance);
  } catch (error) {
    if (error.message === 'Invalid address') {
      return res.status(400).json({ error: 'Bad Request', message: error.message });
    }
    next(error);
  }
});

module.exports = router;
