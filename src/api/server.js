const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const config = require('./config/index');
const logger = require('./utils/logger');
const { errorHandler, notFound } = require('./middleware/errorHandler');

// Routes
const healthRoutes = require('./routes/health');
const systemRoutes = require('./routes/system');
const balanceRoutes = require('./routes/balance');
const depositRoutes = require('./routes/deposit');
const withdrawalRoutes = require('./routes/withdrawal');
const kycRoutes = require('./routes/kyc');
const mobileRoutes = require('./routes/mobile');
const securityRoutes = require('./routes/security');

const app = express();

// Security
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    if (config.allowedOrigins.indexOf(origin) !== -1 || config.env === 'development') {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked for origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

// Body parsing
app.use(express.json({ limit: '1mb' }));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000, // Increased from 100 to 1000 for testing
  message: { error: 'Too many requests', message: 'Please try again later.' },
});
app.use('/api/', apiLimiter);

// Request logging
app.use((req, res, next) => {
  logger.debug(`${req.method} ${req.path}`, {
    ip: req.ip,
    origin: req.headers.origin,
  });
  next();
});

// Serve built frontend
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

// Mount routes
app.use('/health', healthRoutes);
app.use('/api/v1/system', systemRoutes);
app.use('/api/v1/balance', balanceRoutes);
app.use('/api/v1/deposit', depositRoutes);
app.use('/api/v1/withdrawal', withdrawalRoutes);
app.use('/api/v1/kyc', kycRoutes);

// Mobile app routes (JWT auth)
app.use('/api/gtk', mobileRoutes);
app.use('/api/security', securityRoutes);

// SPA fallback — serve index.html for non-API routes
const publicIndex = path.join(publicDir, 'index.html');
app.use((req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/health')) return next();
  res.sendFile(publicIndex, (err) => { if (err) next(); });
});

// 404 handler
app.use(notFound);

// Error handler
app.use(errorHandler);

// Start server
if (require.main === module) {
  app.listen(config.port, () => {
    logger.info(`GTK Bank API v2.0.0 running on port ${config.port}`);
    logger.info(`Network: ${config.network}`);
    logger.info(`Environment: ${config.env}`);
    logger.info(`Token: ${config.blockchain.gtkTokenAddress}`);
    logger.info(`Bank: ${config.blockchain.gtkBankAddress}`);

    // Start price cron
    require('./cron/priceUpdater');
  });
}

module.exports = app;
