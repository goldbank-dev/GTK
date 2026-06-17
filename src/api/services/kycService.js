const axios = require('axios');
const config = require('../config/index');
const logger = require('../utils/logger');

const ASAAS_API = axios.create({
  baseURL: config.asaas.apiUrl,
  headers: {
    'access_token': config.asaas.apiKey,
    'Content-Type': 'application/json',
  },
});

class KYCService {
  async createCustomer(userData) {
    try {
      const response = await ASAAS_API.post('/customers', {
        name: userData.name,
        email: userData.email,
        cpfCnpj: userData.document,
        mobilePhone: userData.phone,
        notificationDisabled: false,
        externalReference: userData.walletAddress,
      });

      logger.info(`Asaas customer created: ${response.data.id}`);
      return response.data;
    } catch (error) {
      logger.error('Asaas createCustomer failed:', error.response?.data || error.message);
      throw new Error('Failed to create customer: ' + (error.response?.data?.errors?.[0]?.description || error.message));
    }
  }

  async checkKYCStatus(customerId) {
    try {
      const [customer, account] = await Promise.all([
        ASAAS_API.get(`/customers/${customerId}`),
        ASAAS_API.get(`/customers/${customerId}/account`),
      ]);

      const status = this._mapKYCStatus(customer.data, account.data);

      return {
        asaasCustomerId: customerId,
        name: customer.data.name,
        email: customer.data.email,
        document: customer.data.cpfCnpj,
        status: status.status,
        tier: status.tier,
        canTransact: status.canTransact,
        restrictions: status.restrictions,
        lastUpdated: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('KYC check failed:', error.response?.data || error.message);
      throw new Error('KYC verification failed');
    }
  }

  async requestKYC(customerId) {
    try {
      const response = await ASAAS_API.post(`/customers/${customerId}/kyc`, {
        type: 'individual_person',
      });

      logger.info(`KYC requested for customer: ${customerId}`);
      return response.data;
    } catch (error) {
      logger.error('KYC request failed:', error.response?.data || error.message);
      throw new Error('KYC request failed: ' + (error.response?.data?.errors?.[0]?.description || error.message));
    }
  }

  async getPixKeyStatus(pixKey) {
    try {
      const response = await ASAAS_API.get(`/pix/addresses?address=${encodeURIComponent(pixKey)}`);
      return response.data;
    } catch (error) {
      logger.error('PIX key check failed:', error.response?.data || error.message);
      return { status: 'unknown', error: error.message };
    }
  }

  _mapKYCStatus(customer, account) {
    if (account.status === 'APPROVED') {
      return { status: 'approved', tier: 3, canTransact: true, restrictions: [] };
    }
    if (account.status === 'PENDING_ANALYSIS') {
      return { status: 'pending_review', tier: 1, canTransact: false, restrictions: ['pending_kyc'] };
    }
    if (account.status === 'REJECTED') {
      return { status: 'rejected', tier: 0, canTransact: false, restrictions: ['kyc_rejected'] };
    }
    if (customer.kycRequired && !customer.kycApproved) {
      return { status: 'kyc_required', tier: 0, canTransact: false, restrictions: ['kyc_not_started'] };
    }
    return { status: 'pending', tier: 0, canTransact: false, restrictions: ['unknown'] };
  }
}

module.exports = new KYCService();
