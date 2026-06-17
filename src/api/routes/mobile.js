const { Router } = require('express');
const { ethers } = require('ethers');
const blockchainService = require('../services/blockchainService');
const pixService = require('../services/pixService');
const exchangeService = require('../services/exchangeService');
const { authenticateJWT } = require('../middleware/jwtAuth');
const logger = require('../utils/logger');

const router = Router();

// GET /api/gtk/balance/:address — saldo GTK da carteira
router.get('/balance/:address', authenticateJWT, async (req, res, next) => {
  try {
    const { address } = req.params;
    const [balance, rates] = await Promise.all([
      blockchainService.getBalance(address),
      exchangeService.getRate(),
    ]);

    const goldGrams = balance.gtkBalance;          // 1 GTK = 1g
    const goldValueUSD = parseFloat(balance.estimatedUSDValue);
    const goldValueBRL = (goldValueUSD * rates.usdToBrl).toFixed(2);

    res.json({
      gtkBalance: balance.gtkBalance,
      goldGrams,
      goldValueBRL,
      goldValueUSD: goldValueUSD.toFixed(2),
    });
  } catch (error) {
    if (error.message === 'Invalid address') {
      return res.status(400).json({ error: 'Bad Request', message: error.message });
    }
    next(error);
  }
});

// GET /api/gtk/price — preço do ouro em tempo real
router.get('/price', async (req, res, next) => {
  try {
    const info = await blockchainService.getSystemInfo();
    res.json({
      goldPricePerGram: parseFloat(info.goldPricePerGram),
      goldPriceBRL: (parseFloat(info.goldPricePerGram) * info.usdToBrl).toFixed(2),
      currency: 'USD',
      source: 'chainlink',
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/gtk/deposit/pix/create — criar PIX para comprar ouro
router.post('/deposit/pix/create', authenticateJWT, async (req, res, next) => {
  try {
    const { amountBRL, userAddress } = req.body;

    if (!amountBRL || amountBRL < 50) {
      return res.status(400).json({ error: 'Invalid amount', message: 'Mínimo R$ 50,00' });
    }
    if (!userAddress || !/^0x[a-fA-F0-9]{40}$/.test(userAddress)) {
      return res.status(400).json({ error: 'Invalid address', message: 'userAddress inválido' });
    }

    const pixId = pixService.generatePixId();
    const exchangeRate = await exchangeService.getRate();
    const amountUSDT = exchangeService.convertBRLToUSDT(amountBRL, exchangeRate);

    let goldPrice;
    try {
      goldPrice = await blockchainService.gtkToken.goldPricePerGram();
    } catch {
      goldPrice = ethers.parseUnits('75', 8);
    }

    const gtkAmount = exchangeService.calculateGTKAmount(amountUSDT, goldPrice);
    const estimatedGTK = ethers.formatEther(gtkAmount);

    pixService.registerPending(pixId, {
      userAddress,
      amountBRL,
      amountUSDT,
      gtkAmount: gtkAmount.toString(),
    });

    const pixCopyPaste = pixService.generateCopyPasteKey(pixId, amountBRL);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(pixCopyPaste)}`;

    res.json({
      pixId,
      qrCodeBase64: qrUrl,
      qrCodePayload: pixCopyPaste,
      amountBRL,
      goldGrams: estimatedGTK,
      estimatedGTK,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/gtk/withdraw — sacar GTK → PIX
router.post('/withdraw', authenticateJWT, async (req, res, next) => {
  try {
    const { amountGTK, pixKey, userAddress } = req.body;

    if (!amountGTK || parseFloat(amountGTK) <= 0) {
      return res.status(400).json({ error: 'Invalid amount', message: 'amountGTK deve ser > 0' });
    }
    if (!pixKey) {
      return res.status(400).json({ error: 'Invalid PIX key', message: 'pixKey obrigatório' });
    }
    if (!userAddress || !/^0x[a-fA-F0-9]{40}$/.test(userAddress)) {
      return res.status(400).json({ error: 'Invalid address', message: 'userAddress inválido' });
    }

    const balanceInfo = await blockchainService.getBalance(userAddress);
    if (parseFloat(balanceInfo.gtkBalance) < parseFloat(amountGTK)) {
      return res.status(400).json({ error: 'Insufficient balance', message: 'Saldo GTK insuficiente' });
    }

    const amountWei = blockchainService.parseEther(amountGTK.toString());
    const crypto = require('crypto');
    const withdrawalId = '0x' + crypto.randomBytes(32).toString('hex');

    const result = await blockchainService.requestWithdrawal(amountWei, amountWei, withdrawalId);

    logger.info(`Mobile withdraw: user=${userAddress}, amount=${amountGTK} GTK, tx=${result.hash}`);

    res.json({
      status: 'processing',
      withdrawalId,
      blockchainTxHash: result.hash,
      amountGTK,
      pixKey,
      estimatedArrival: '1-2 dias úteis',
      fee: '0.75%',
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
