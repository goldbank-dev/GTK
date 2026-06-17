const { Router } = require('express');
const blockchainService = require('../services/blockchainService');
const kycService = require('../services/kycService');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = Router();

// Check KYC status for a wallet address
router.get('/:address', authenticate, async (req, res, next) => {
  try {
    const { address } = req.params;
    const onChainKYC = await blockchainService.checkKYC(address);

    res.json({
      walletAddress: address,
      ...onChainKYC,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

// Create Asaas customer and initiate KYC
router.post('/register', authenticate, async (req, res, next) => {
  try {
    const { name, email, document, phone, walletAddress } = req.body;

    if (!name || !email || !document || !walletAddress) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'name, email, document, and walletAddress are required',
      });
    }

    // Create customer on Asaas
    const customer = await kycService.createCustomer({
      name,
      email,
      document: document.replace(/\D/g, ''),
      phone: phone?.replace(/\D/g, ''),
      walletAddress,
    });

    // Request KYC process
    const kycRequest = await kycService.requestKYC(customer.id);

    logger.info(`KYC initiated for ${walletAddress}, Asaas customer: ${customer.id}`);

    res.json({
      status: 'kyc_initiated',
      asaasCustomerId: customer.id,
      walletAddress,
      message: 'KYC process started. Complete verification via Asaas.',
      kycUrl: kycRequest?.url || null,
    });
  } catch (error) {
    next(error);
  }
});

// Asaas webhook for KYC status updates
router.post('/webhook', async (req, res, next) => {
  try {
    const { event, customer } = req.body;

    logger.info(`Asaas webhook received: ${event}`, { customer });

    // Asaas sends events like: CUSTOMER_KYC_APPROVED, CUSTOMER_KYC_REJECTED, etc.
    if (event === 'CUSTOMER_KYC_APPROVED' && customer?.externalReference) {
      const walletAddress = customer.externalReference;
      logger.info(`KYC approved for wallet: ${walletAddress}`);
      // TODO: Update on-chain KYC tier via COMPLIANCE_ROLE
    }

    res.json({ received: true });
  } catch (error) {
    logger.error('Asaas webhook error:', error);
    next(error);
  }
});

// Check PIX key validity
router.get('/pix-key/:pixKey', authenticate, async (req, res, next) => {
  try {
    const { pixKey } = req.params;
    const result = await kycService.getPixKeyStatus(pixKey);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
