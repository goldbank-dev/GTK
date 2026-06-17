/**
 * GTK API Client
 * Centralized service for all frontend API calls.
 * Replaces raw fetch() calls scattered across components.
 */

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';
const API_KEY = process.env.REACT_APP_API_KEY || '';

class GTKApiClient {
  constructor(baseURL = API_BASE_URL, apiKey = API_KEY) {
    this.baseURL = baseURL.replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
    };
  }

  async _fetch(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      headers: { ...this.defaultHeaders, ...options.headers },
      ...options,
    };

    if (config.body && typeof config.body === 'object') {
      config.body = JSON.stringify(config.body);
    }

    const response = await fetch(url, config);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // System
  async healthCheck() {
    return this._fetch('/health');
  }

  async getSystemInfo() {
    return this._fetch('/api/v1/system/info');
  }

  // Balance
  async getBalance(address) {
    return this._fetch(`/api/v1/balance/${address}`);
  }

  // KYC
  async getKYCStatus(address) {
    return this._fetch(`/api/v1/kyc/${address}`);
  }

  async registerKYC(data) {
    return this._fetch('/api/v1/kyc/register', {
      method: 'POST',
      body: data,
    });
  }

  async checkPixKey(pixKey) {
    return this._fetch(`/api/v1/kyc/pix-key/${encodeURIComponent(pixKey)}`);
  }

  // Deposits
  async createPixDeposit(userAddress, amountBRL) {
    return this._fetch('/api/v1/deposit/pix/create', {
      method: 'POST',
      body: { userAddress, amountBRL },
    });
  }

  async getDepositStatus(pixId) {
    return this._fetch(`/api/v1/deposit/pix/${pixId}/status`);
  }

  // Withdrawals
  async requestWithdrawal(userAddress, gtkAmount, pixKey) {
    return this._fetch('/api/v1/withdrawal/pix', {
      method: 'POST',
      body: { userAddress, gtkAmount, pixKey },
    });
  }
}

// Singleton
const apiClient = new GTKApiClient();

export default apiClient;
export { GTKApiClient };
