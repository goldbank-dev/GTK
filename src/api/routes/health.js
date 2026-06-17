const { Router } = require('express');
const config = require('../config/index');
const blockchainService = require('../services/blockchainService');

const router = Router();

router.get('/', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    network: config.network,
    environment: config.env,
    version: '2.0.0',
    wallet: blockchainService.getWalletAddress(),
  });
});

module.exports = router;
