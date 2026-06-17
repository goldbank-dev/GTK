const { Router } = require('express');
const crypto = require('crypto');
const blockchainService = require('../services/blockchainService');
const pixService = require('../services/pixService');
const exchangeService = require('../services/exchangeService');
const { authenticate } = require('../middleware/auth');
const { requireKYC } = require('../middleware/kycCheck');
const logger = require('../utils/logger');

const router = Router();

// Request withdrawal (GTK -> PIX)
router.post('/pix', authenticate, requireKYC, async (req, res, next) => {
  try {
    const { userAddress, gtkAmount, pixKey } = req.body;

    if (!gtkAmount || gtkAmount <= 0) {
      return res.status(400).json({ error: 'Invalid amount', message: 'gtkAmount must be > 0' });
    }

    if (!pixKey || pixKey.length < 11) {
      return res.status(400).json({ error: 'Invalid PIX key', message: 'PIX key must be at least 11 characters' });
    }

    // Verify balance
    const balanceInfo = await blockchainService.getBalance(userAddress);
    if (parseFloat(balanceInfo.gtkBalance) < gtkAmount) {
      return res.status(400).json({ error: 'Insufficient balance', message: 'Not enough GTK balance' });
    }

    // Calculate amounts
    const amountWei = blockchainService.parseEther(gtkAmount.toString());
    const withdrawalId = '0x' + crypto.randomBytes(32).toString('hex');

    // Process on blockchain
    const goldPrice = await blockchainService.gtkToken.goldPricePerGram();
    const goldGrams = amountWei;
    const result = await blockchainService.requestWithdrawal(amountWei, goldGrams, withdrawalId);

    logger.info(`Withdrawal requested: user=${userAddress}, amount=${gtkAmount} GTK, tx=${result.hash}`);

    res.json({
      status: 'processing',
      withdrawalId,
      blockchainTxHash: result.hash,
      gtkAmount,
      pixKey,
      estimatedBRL: ((gtkAmount * Number(goldPrice)) / 10 ** 8 / 0.20 * 0.9925).toFixed(2),
      fee: '0.75%',
      estimatedArrival: '1-2 business days',
    });
  } catch (error) {
    next(error);
  }
});

// ─── WEBHOOK: Validação de Saque GTK ─────────────────────────────────────────
// Asaas chama este endpoint antes de processar saques da conta GTK
const ASAAS_IPS = ['177.153.18.', '177.153.19.'];
const { ASAAS_WEBHOOK_TOKEN } = process.env;

router.post('/validate-withdrawal', async (req, res) => {
  // Validar IP
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  const validIP = ASAAS_IPS.some(p => ip.startsWith(p));
  if (process.env.NODE_ENV === 'production' && !validIP) {
    logger.warn(`[WITHDRAW-VALIDATE] IP bloqueado: ${ip}`);
    return res.status(403).json({ authorized: false });
  }

  // Validar token
  const token = req.headers['asaas-access-token'] || req.body?.accessToken;
  if (ASAAS_WEBHOOK_TOKEN && token !== ASAAS_WEBHOOK_TOKEN) {
    logger.warn('[WITHDRAW-VALIDATE] Token inválido');
    return res.status(401).json({ authorized: false });
  }

  const { id, value, type } = req.body;
  logger.info(`[WITHDRAW-VALIDATE] Saque: R$${value} | Tipo: ${type} | ID: ${id}`);

  // Limite automático: acima de R$ 100.000 requer revisão manual
  if (value > 100000) {
    logger.warn(`[WITHDRAW-VALIDATE] ❌ Acima do limite: R$${value}`);
    return res.json({ authorized: false, reason: 'Valor acima do limite. Contate o suporte GTK.' });
  }

  logger.info(`[WITHDRAW-VALIDATE] ✅ Autorizado: R$${value}`);
  res.json({ authorized: true });
});

module.exports = router;
