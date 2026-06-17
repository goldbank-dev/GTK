'use strict';
/**
 * FASE 0 — Geração de wallets de PRODUÇÃO para Mainnet.
 * Execute OFFLINE, salve as mnemônicas em local físico seguro.
 * NUNCA reutilize wallets de testnet em mainnet.
 *
 * Uso: node scripts/gen-wallets-mainnet.js
 */
const { ethers } = require('ethers');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const WALLET_ROLES = ['DEPLOYER_MAINNET', 'BANK_OPERATOR_MAINNET', 'TREASURY_MAINNET'];

function generateWallet(role) {
  const wallet = ethers.Wallet.createRandom();
  return {
    role,
    address: wallet.address,
    mnemonic: wallet.mnemonic.phrase,
    privateKey: wallet.privateKey,
    generatedAt: new Date().toISOString(),
  };
}

function generateEncryptionKey() {
  return crypto.randomBytes(32).toString('hex');
}

function generateJwtSecret() {
  return crypto.randomBytes(64).toString('hex');
}

function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║    GTK BANK — Geração de Wallets de Produção    ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');
  console.log('⚠️  ATENÇÃO: Guarde estas informações em local SEGURO e OFFLINE.');
  console.log('⚠️  Nunca versione este output. Nunca compartilhe chaves privadas.');
  console.log('');

  const wallets = WALLET_ROLES.map(generateWallet);
  const encryptionKey = generateEncryptionKey();
  const jwtSecret = generateJwtSecret();

  wallets.forEach(w => {
    console.log(`─── ${w.role} ─────────────────────────────────────────`);
    console.log(`  Endereço   : ${w.address}`);
    console.log(`  Mnemônica  : ${w.mnemonic}`);
    console.log(`  Private Key: ${w.privateKey}`);
    console.log('');
  });

  console.log('─── CHAVES DO SERVIDOR ──────────────────────────────────');
  console.log(`  ENCRYPTION_KEY (AES-256): ${encryptionKey}`);
  console.log(`  JWT_SECRET              : ${jwtSecret}`);
  console.log('');

  // Gera o .env.production com os valores (sem mnemônicas — apenas chaves)
  const envLines = [
    '# GTK Bank — .env.production',
    '# Gerado em: ' + new Date().toISOString(),
    '# ⚠️ NUNCA versionar este arquivo',
    '',
    '# === BLOCKCHAIN ===',
    `DEPLOYER_PK=${wallets[0].privateKey}`,
    `BANK_PRIVATE_KEY=${wallets[1].privateKey}`,
    `TREASURY_ADDRESS=${wallets[2].address}`,
    '',
    '# === REDE ===',
    'NETWORK=mainnet',
    'MAINNET_RPC=https://eth-mainnet.g.alchemy.com/v2/SEU_ALCHEMY_KEY_AQUI',
    '',
    '# === CONTRATOS (preencher após deploy) ===',
    'GTK_TOKEN_ADDRESS=',
    'GTK_BANK_ADDRESS=',
    'GTK_ORACLE_ADDRESS=',
    '',
    '# === ASAAS ===',
    'ASAAS_API_KEY=SUA_CHAVE_ASAAS_PROD_AQUI',
    'ASAAS_BASE_URL=https://api.asaas.com/v3',
    'ASAAS_WALLET_ID=SEU_WALLET_ID_ASAAS',
    '',
    '# === SEGURANÇA ===',
    `ENCRYPTION_KEY=${encryptionKey}`,
    `JWT_SECRET=${jwtSecret}`,
    '',
    '# === GCP ===',
    'GTK_API_URL=https://api.gtk.bank',
    'GTK_API_KEY=SUA_API_KEY_GTK_AQUI',
    'ALLOWED_ORIGINS=https://app.gtk.bank,https://goldbank.app',
    '',
    '# === ETHERSCAN ===',
    'ETHERSCAN_KEY=SUA_KEY_ETHERSCAN',
    '',
    '# === NODE ===',
    'NODE_ENV=production',
    'PORT=3000',
  ];

  const envPath = path.join(__dirname, '..', '.env.production.generated');
  fs.writeFileSync(envPath, envLines.join('\n'));

  console.log(`✅ .env.production.generated criado em: ${envPath}`);
  console.log('');
  console.log('📋 PRÓXIMOS PASSOS:');
  console.log('  1. Salve as mnemônicas acima em cofre físico offline');
  console.log('  2. Adicione os valores ao Google Secret Manager (FASE 1)');
  console.log('  3. NÃO versione o .env.production.generated');
  console.log('  4. Envie ETH para o endereço DEPLOYER_MAINNET antes do deploy');
  console.log('');
  console.log(`  DEPLOYER (receber ETH aqui): ${wallets[0].address}`);
  console.log('');
}

main();
