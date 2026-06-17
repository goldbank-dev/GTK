const axios = require('axios');
const logger = require('../utils/logger');

class ExchangeService {
  async getRate() {
    try {
      // Try AwesomeAPI (BRL exchange rates, no key needed)
      const response = await axios.get(
        'https://economia.awesomeapi.com.br/json/last/USD-BRL',
        { timeout: 5000 }
      );
      const rate = parseFloat(response.data.USDBRL.bid);
      return {
        brlToUsd: 1 / rate,
        usdToBrl: rate,
        source: 'awesomeapi',
        timestamp: new Date().toISOString(),
      };
    } catch (primaryError) {
      logger.warn('AwesomeAPI failed, trying fallback:', primaryError.message);
      try {
        // Fallback: ExchangeRate-API (free tier)
        const response = await axios.get(
          'https://open.er-api.com/v6/latest/USD',
          { timeout: 5000 }
        );
        const rate = response.data.rates.BRL;
        return {
          brlToUsd: 1 / rate,
          usdToBrl: rate,
          source: 'exchangerate-api',
          timestamp: new Date().toISOString(),
        };
      } catch (fallbackError) {
        logger.error('All exchange rate sources failed:', fallbackError.message);
        // Ultimate fallback: hardcoded approximate rate
        return {
          brlToUsd: 0.20,
          usdToBrl: 5.00,
          source: 'fallback',
          timestamp: new Date().toISOString(),
        };
      }
    }
  }

  convertBRLToUSDT(brlAmount, rate) {
    const usdAmount = brlAmount * rate.brlToUsd;
    return Math.floor(usdAmount * 10 ** 6);
  }

  calculateGTKAmount(usdtAmount, goldPricePerGram) {
    if (goldPricePerGram === 0n) return 0n;
    const usdtWei = BigInt(usdtAmount) * 10n ** 12n; // convert 6-dec to 18-dec
    const gtkAmount = (usdtWei * 10n ** 8n) / goldPricePerGram;
    return gtkAmount;
  }
}

module.exports = new ExchangeService();
