const { Router } = require('express');
const blockchainService = require('../services/blockchainService');
const { authenticate } = require('../middleware/auth');

const router = Router();

router.get('/info', authenticate, async (req, res, next) => {
  try {
    const info = await blockchainService.getSystemInfo();
    res.json({
      ...info,
      network: blockchainService.getNetwork(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
