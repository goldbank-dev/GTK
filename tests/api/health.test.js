const request = require('supertest');

// Mock blockchain before requiring server
jest.mock('../../src/api/services/blockchainService', () => ({
  gtkToken: {
    totalSupply: jest.fn().mockResolvedValue(BigInt('10000000000000000000000')),
    totalGoldReserves: jest.fn().mockResolvedValue(BigInt('10000000000000000000000')),
    goldPricePerGram: jest.fn().mockResolvedValue(BigInt('6500000000')),
    isFullyBacked: jest.fn().mockResolvedValue(true),
    getReserveRatio: jest.fn().mockResolvedValue(BigInt('10000')),
    blacklisted: jest.fn().mockResolvedValue(false),
    kycTier: jest.fn().mockResolvedValue(3),
    balanceOf: jest.fn().mockResolvedValue(BigInt('500000000000000000000')),
    updateGoldPrice: jest.fn().mockResolvedValue({ wait: () => ({ hash: '0xmocked', blockNumber: 12345 }) }),
  },
  gtkBank: {
    processDeposit: jest.fn().mockResolvedValue({ wait: () => ({ hash: '0xdeposit', blockNumber: 12346 }) }),
    requestWithdrawal: jest.fn().mockResolvedValue({ wait: () => ({ hash: '0xwithdraw', blockNumber: 12347 }) }),
    processedDeposits: jest.fn().mockResolvedValue(false),
    depositFeeBps: jest.fn().mockResolvedValue(50),
    withdrawalFeeBps: jest.fn().mockResolvedValue(75),
  },
  usdt: {
    balanceOf: jest.fn().mockResolvedValue(BigInt('1000000000')),
  },
  getSystemInfo: jest.fn().mockResolvedValue({
    totalSupply: '10000.0',
    totalGoldReserves: '10000.0',
    goldPricePerGram: '65.00',
    isFullyBacked: true,
    reserveRatio: '100.00%',
  }),
  getBalance: jest.fn().mockImplementation((address) => {
    if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
      throw new Error('Invalid address');
    }
    return {
      address,
      gtkBalance: '500.0',
      usdtBalance: '1000.0',
      estimatedUSDValue: '32500.00',
      goldPricePerGram: '65.00',
    };
  }),
  checkKYC: jest.fn().mockResolvedValue({ tier: 3, isBlacklisted: false, isVerified: true }),
  processDeposit: jest.fn().mockResolvedValue({ hash: '0xdeposit', blockNumber: 12346 }),
  requestWithdrawal: jest.fn().mockResolvedValue({ hash: '0xwithdraw', blockNumber: 12347 }),
  checkDepositProcessed: jest.fn().mockResolvedValue(false),
  getWalletAddress: jest.fn().mockReturnValue('0xabcdefabcdef'),
  getNetwork: jest.fn().mockReturnValue('sepolia'),
  parseEther: jest.fn().mockImplementation((v) => BigInt(v) * BigInt(10) ** BigInt(18)),
  formatEther: jest.fn().mockImplementation((v) => (Number(v) / 10 ** 18).toString()),
  encodeBytes32String: jest.fn().mockImplementation((s) => '0x' + Buffer.from(s).toString('hex').padEnd(64, '0')),
}));

jest.mock('../../src/api/config/blockchain', () => ({
  provider: {},
  wallet: { address: '0xabcdefabcdef' },
  gtkToken: {},
  gtkBank: {},
  usdt: {},
  ethers: require('ethers'),
}));

jest.mock('../../src/api/config/index', () => ({
  env: 'test',
  port: 0,
  network: 'sepolia',
  blockchain: {
    providerUrl: 'https://eth-sepolia.g.alchemy.com/v2/test',
    bankPrivateKey: '0xtest',
    gtkTokenAddress: '0x646C3a2A1D4A782Ce464c2Ddf0667aCcD689C2F5',
    gtkBankAddress: '0x938089e3C2514A088b26C6b813e51f3c1D0296dE',
    usdtAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  },
  apiKey: 'test-api-key-2026',
  allowedOrigins: ['http://localhost:3000'],
  asaas: { apiKey: 'test', apiUrl: 'https://sandbox.asaas.com/api/v3' },
  priceUpdateIntervalMs: 60000,
}));

const app = require('../../src/api/server');

describe('Health Check', () => {
  it('GET /health returns healthy status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.network).toBe('sepolia');
    expect(res.body.version).toBe('2.0.0');
  });
});

describe('System Info', () => {
  it('GET /api/v1/system/info with valid API key', async () => {
    const res = await request(app)
      .get('/api/v1/system/info')
      .set('x-api-key', 'test-api-key-2026');
    expect(res.status).toBe(200);
    expect(res.body.totalSupply).toBe('10000.0');
    expect(res.body.isFullyBacked).toBe(true);
  });

  it('GET /api/v1/system/info without API key returns 401', async () => {
    const res = await request(app).get('/api/v1/system/info');
    expect(res.status).toBe(401);
  });
});

describe('Balance', () => {
  it('GET /api/v1/balance/:address returns balance', async () => {
    const res = await request(app)
      .get('/api/v1/balance/0x1234567890123456789012345678901234567890')
      .set('x-api-key', 'test-api-key-2026');
    expect(res.status).toBe(200);
    expect(res.body.gtkBalance).toBe('500.0');
  });

  it('GET /api/v1/balance/:address with invalid address returns 400', async () => {
    const res = await request(app)
      .get('/api/v1/balance/invalid')
      .set('x-api-key', 'test-api-key-2026');
    expect(res.status).toBe(400);
  });
});

describe('Deposit Flow', () => {
  it('POST /api/v1/deposit/pix/create creates PIX', async () => {
    const res = await request(app)
      .post('/api/v1/deposit/pix/create')
      .set('x-api-key', 'test-api-key-2026')
      .send({ userAddress: '0x1234567890123456789012345678901234567890', amountBRL: 100 });
    expect(res.status).toBe(200);
    expect(res.body.pixId).toBeDefined();
    expect(res.body.amountBRL).toBe(100);
    expect(res.body.pixCopyPaste).toBeDefined();
  });

  it('POST /api/v1/deposit/pix/create with amount < 50 returns 400', async () => {
    const res = await request(app)
      .post('/api/v1/deposit/pix/create')
      .set('x-api-key', 'test-api-key-2026')
      .send({ userAddress: '0x1234567890123456789012345678901234567890', amountBRL: 10 });
    expect(res.status).toBe(400);
  });
});

describe('Withdrawal Flow', () => {
  it('POST /api/v1/withdrawal/pix requests withdrawal', async () => {
    const res = await request(app)
      .post('/api/v1/withdrawal/pix')
      .set('x-api-key', 'test-api-key-2026')
      .send({
        userAddress: '0x1234567890123456789012345678901234567890',
        gtkAmount: 10,
        pixKey: '12345678901',
      });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('processing');
    expect(res.body.blockchainTxHash).toBeDefined();
  });
});

describe('KYC', () => {
  it('GET /api/v1/kyc/:address returns KYC status', async () => {
    const res = await request(app)
      .get('/api/v1/kyc/0x1234567890123456789012345678901234567890')
      .set('x-api-key', 'test-api-key-2026');
    expect(res.status).toBe(200);
    expect(res.body.tier).toBe(3);
    expect(res.body.isVerified).toBe(true);
  });
});
