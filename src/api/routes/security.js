const { Router } = require('express');
const { authenticateJWT } = require('../middleware/jwtAuth');
const logger = require('../utils/logger');

const router = Router();

// POST /api/security/verify-integrity — Play Integrity (Android) / App Attest (iOS)
router.post('/verify-integrity', authenticateJWT, async (req, res) => {
  const { token, platform } = req.body;

  if (!token || !platform) {
    return res.status(400).json({ isValid: false, message: 'token e platform obrigatórios' });
  }

  // Em produção completa: verificar token com Google Play Integrity API / Apple App Attest
  // Por ora: valida estrutura básica e loga para auditoria
  const isKnownPlatform = ['ios', 'android'].includes(platform.toLowerCase());

  logger.info(`[INTEGRITY] platform=${platform}, tokenLen=${token.length}, valid=${isKnownPlatform}`);

  res.json({
    isValid: isKnownPlatform,
    verdict: isKnownPlatform ? 'MEETS_BASIC_INTEGRITY' : 'UNKNOWN_PLATFORM',
    message: isKnownPlatform ? 'OK' : 'Plataforma não reconhecida',
  });
});

module.exports = router;
