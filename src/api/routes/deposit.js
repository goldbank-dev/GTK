const { Router } = require('express');
const { ethers } = require('ethers');
const blockchainService = require('../services/blockchainService');
const pixService = require('../services/pixService');
const exchangeService = require('../services/exchangeService');
const { authenticate } = require('../middleware/auth');
const { requireKYC } = require('../middleware/kycCheck');
const logger = require('../utils/logger');

const router = Router();

// Create PIX for deposit
router.post('/pix/create', authenticate, requireKYC, async (req, res, next) => {
  try {
    const { userAddress, amountBRL } = req.body;

    if (!amountBRL || amountBRL <= 0) {
      return res.status(400).json({ error: 'Invalid amount', message: 'amountBRL must be > 0' });
    }

    if (amountBRL < 50) {
      return res.status(400).json({ error: 'Invalid amount', message: 'Minimum deposit is R$ 50,00' });
    }

    const pixId = pixService.generatePixId();
    const exchangeRate = await exchangeService.getRate();
    const amountUSDT = exchangeService.convertBRLToUSDT(amountBRL, exchangeRate);
    
    let goldPrice;
    try {
      goldPrice = await blockchainService.gtkToken.goldPricePerGram();
    } catch (e) {
      logger.error('Error fetching gold price from blockchain', e);
      // Fallback to a default or cached price if blockchain fails
      goldPrice = ethers.parseUnits('75', 8); 
    }
    
    const gtkAmount = exchangeService.calculateGTKAmount(amountUSDT, goldPrice);

    pixService.registerPending(pixId, {
      userAddress,
      amountBRL,
      amountUSDT,
      gtkAmount: gtkAmount.toString(),
    });

    const pixCopyPaste = pixService.generateCopyPasteKey(pixId, amountBRL);

    res.json({
      pixId,
      pixCopyPaste,
      qrCode: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(pixCopyPaste)}`,
      amountBRL,
      amountUSD: (amountBRL * exchangeRate.brlToUsd).toFixed(2),
      amountUSDT,
      estimatedGTK: ethers.formatEther(gtkAmount),
      exchangeRate: exchangeRate.brlToUsd,
      goldPricePerGram: (Number(goldPrice) / 10 ** 8).toFixed(2),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

// Webhook for PIX confirmation (called by payment gateway)
router.post('/pix/webhook', async (req, res, next) => {
  try {
    const { pixId, status, gatewayData } = req.body;

    if (!pixId) {
      return res.status(400).json({ error: 'Bad Request', message: 'pixId is required' });
    }

    const pendingTx = pixService.getPending(pixId);
    if (!pendingTx) {
      return res.status(404).json({ error: 'Not Found', message: 'PIX transaction not found' });
    }

    if (status !== 'confirmed') {
      pixService.updateStatus(pixId, status);
      return res.json({ status: 'pending', message: 'Waiting for confirmation' });
    }

    // Check if already processed on-chain
    const isProcessed = await blockchainService.checkDepositProcessed(pixId);
    if (isProcessed) {
      return res.status(409).json({ error: 'Conflict', message: 'PIX already processed' });
    }

    // Re-verify KYC before processing
    const kyc = await blockchainService.checkKYC(pendingTx.userAddress);
    if (!kyc.isVerified) {
      logger.warn(`KYC not verified for ${pendingTx.userAddress} during webhook`);
      return res.status(403).json({ error: 'KYC Required', message: 'KYC not verified' });
    }

    // Process on blockchain
    const result = await blockchainService.processDeposit(
      pixId,
      pendingTx.userAddress,
      Math.floor(pendingTx.amountBRL * 100), // brlAmount in cents
      pendingTx.amountUSDT,
      BigInt(pendingTx.gtkAmount), // goldGrams = gtkAmount (1:1 backed)
      BigInt(pendingTx.gtkAmount)
    );

    pixService.updateStatus(pixId, 'completed', {
      blockchainTxHash: result.hash,
      completedAt: new Date().toISOString(),
    });

    logger.info(`Deposit completed: ${pixId}, TX: ${result.hash}`);

    res.json({
      status: 'completed',
      pixId,
      blockchainTxHash: result.hash,
      gtkAmount: ethers.formatEther(pendingTx.gtkAmount),
      userAddress: pendingTx.userAddress,
    });
  } catch (error) {
    next(error);
  }
});

// Check PIX status
router.get('/pix/:pixId/status', authenticate, async (req, res, next) => {
  try {
    const { pixId } = req.params;

    const [pendingTx, isProcessed] = await Promise.all([
      Promise.resolve(pixService.getPending(pixId)),
      blockchainService.checkDepositProcessed(pixId),
    ]);

    if (isProcessed) {
      return res.json({ status: 'completed', pixId, confirmed: true });
    }

    if (pendingTx) {
      return res.json({
        status: pendingTx.status,
        pixId,
        createdAt: pendingTx.createdAt,
        amountBRL: pendingTx.amountBRL,
      });
    }

    res.status(404).json({ error: 'Not Found', message: 'PIX transaction not found' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
