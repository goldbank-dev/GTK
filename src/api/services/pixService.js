const crypto = require('crypto');
const logger = require('../utils/logger');

class PixService {
  constructor() {
    this.pendingTransactions = new Map();
  }

  generatePixId() {
    return '0x' + crypto.randomBytes(32).toString('hex');
  }

  generateCopyPasteKey(pixId, amountBRL) {
    const merchantName = 'GTK Bank';
    const merchantCity = 'Sao Paulo';
    const txId = pixId.slice(2, 12);

    const payload = [
      '000201',
      '26580014BR.GOV.PIX0136' + pixId.slice(2, 38),
      '52040000',
      '5303986',
      '54' + amountBRL.toFixed(2).length.toString().padStart(2, '0') + amountBRL.toFixed(2),
      '5802BR',
      '59' + merchantName.length.toString().padStart(2, '0') + merchantName,
      '60' + merchantCity.length.toString().padStart(2, '0') + merchantCity,
      '62070503***',
      '6304',
    ].join('');

    return payload;
  }

  async verifyPayment(pixId) {
    // TODO: Integrate with real PIX gateway (Asaas, PagSeguro, etc.)
    logger.info(`Verifying PIX: ${pixId}`);

    const pendingTx = this.pendingTransactions.get(pixId);
    if (!pendingTx) {
      return { status: 'not_found' };
    }

    return {
      status: pendingTx.status,
      amount: pendingTx.amountBRL,
      currency: 'BRL',
      timestamp: new Date().toISOString(),
    };
  }

  async confirmPayment(pixId, gatewayData) {
    const pendingTx = this.pendingTransactions.get(pixId);
    if (!pendingTx) {
      throw new Error('PIX transaction not found');
    }

    pendingTx.status = 'confirmed';
    pendingTx.confirmedAt = new Date().toISOString();
    pendingTx.gatewayData = gatewayData;

    logger.info(`PIX confirmed: ${pixId}, amount: ${pendingTx.amountBRL}`);
    return pendingTx;
  }

  registerPending(pixId, data) {
    this.pendingTransactions.set(pixId, {
      ...data,
      status: 'pending',
      createdAt: new Date().toISOString(),
    });
  }

  getPending(pixId) {
    return this.pendingTransactions.get(pixId);
  }

  updateStatus(pixId, status, extra = {}) {
    const tx = this.pendingTransactions.get(pixId);
    if (tx) {
      Object.assign(tx, { status, ...extra });
    }
  }
}

module.exports = new PixService();
