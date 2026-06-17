const axios = require('axios');
const config = require('../config/index');
const blockchainService = require('../services/blockchainService');
const logger = require('../utils/logger');

async function updateGoldPrice() {
  try {
    const sources = [
      {
        name: 'gold-api',
        url: 'https://www.goldapi.io/api/XAU/USD',
        headers: { 'x-access-token': process.env.GOLD_API_KEY || '' },
        parser: (data) => data.price,
      },
      {
        name: 'metals-api',
        url: `https://metals-api.com/api/latest?access_key=${process.env.METALS_API_KEY || ''}&base=XAU&symbols=USD`,
        parser: (data) => data.rates?.USD,
      },
    ];

    let prices = [];

    for (const source of sources) {
      try {
        const response = await axios.get(source.url, {
          timeout: 5000,
          headers: source.headers || {},
        });
        const price = source.parser(response.data);
        if (price && price > 0) {
          prices.push({ source: source.name, price });
          logger.debug(`Price from ${source.name}: $${price}/oz`);
        }
      } catch (e) {
        logger.warn(`Price source ${source.name} failed: ${e.message}`);
      }
    }

    if (prices.length === 0) {
      logger.warn('No price sources available, keeping current price');
      return;
    }

    // Average price per troy ounce
    const avgPricePerOz = prices.reduce((sum, p) => sum + p.price, 0) / prices.length;

    // Convert to price per gram (1 troy oz = 31.1034768g)
    const pricePerGram = Math.floor((avgPricePerOz * 10 ** 8) / 31.1034768);

    // Update on-chain
    await blockchainService.updateGoldPrice(pricePerGram);

    logger.info(`Gold price updated: $${(pricePerGram / 10 ** 8).toFixed(2)}/g (avg of ${prices.length} sources)`);
  } catch (error) {
    logger.error('Price update cron failed:', error.message);
  }
}

// Run on startup
setTimeout(updateGoldPrice, 5000);

// Run at configured interval
setInterval(updateGoldPrice, config.priceUpdateIntervalMs);

logger.info(`Price updater cron initialized (interval: ${config.priceUpdateIntervalMs}ms)`);

module.exports = { updateGoldPrice };
