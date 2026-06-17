const blockchainService = require('../services/blockchainService');
const logger = require('../utils/logger');

async function requireKYC(req, res, next) {
  const { userAddress } = req.body;

  if (!userAddress) {
    return res.status(400).json({ error: 'Bad Request', message: 'userAddress is required' });
  }

  try {
    const kyc = await blockchainService.checkKYC(userAddress);

    if (kyc.isBlacklisted) {
      logger.warn(`Blacklisted address attempted action: ${userAddress}`);
      return res.status(403).json({ error: 'Forbidden', message: 'Account is blacklisted' });
    }

    if (!kyc.isVerified) {
      return res.status(403).json({
        error: 'KYC Required',
        message: 'KYC verification not completed',
        kycStatus: kyc,
      });
    }

    req.kycInfo = kyc;
    next();
  } catch (error) {
    logger.error('KYC middleware error:', error);
    return res.status(500).json({ error: 'Internal', message: 'KYC verification failed' });
  }
}

module.exports = { requireKYC };
