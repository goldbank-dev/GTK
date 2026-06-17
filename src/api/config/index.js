require('dotenv').config();

const config = {
  env: process.env.NODE_ENV || 'development',

  // Server
  port: parseInt(process.env.PORT, 10) || 3000,
  network: process.env.NETWORK || 'sepolia',

  // Blockchain
  blockchain: {
    providerUrl: process.env.NETWORK === 'mainnet'
      ? process.env.MAINNET_RPC
      : process.env.SEPOLIA_RPC,
    bankPrivateKey: process.env.BANK_PRIVATE_KEY,
    gtkTokenAddress: process.env.GTK_TOKEN_ADDRESS,
    gtkBankAddress: process.env.GTK_BANK_ADDRESS,
    usdtAddress: process.env.USDT_ADDRESS,
  },

  // Auth — sanitiza BOM e espaços que o GCP Secret Manager pode injetar
  apiKey: (process.env.API_KEY || '').replace(/^﻿/, '').trim(),
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(','),

  // Asaas
  asaas: {
    apiKey: process.env.ASAAS_API_KEY,
    apiUrl: process.env.ASAAS_API_URL || 'https://sandbox.asaas.com/api/v3',
  },

  // Cron
  priceUpdateIntervalMs: parseInt(process.env.PRICE_UPDATE_INTERVAL_MS, 10) || 15 * 60 * 1000,
};

module.exports = config;
