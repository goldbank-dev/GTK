
// ============================================================
// GTK BANK API - Serviço de Integração PIX ↔ Blockchain
// ============================================================
// Node.js + Express + Web3.js/Ethers.js
// ============================================================

const express = require('express');
const { ethers } = require('ethers');
const axios = require('axios');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const winston = require('winston');
require('dotenv').config();

// ============================================================
// CONFIGURAÇÃO DE LOGS
// ============================================================
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' }),
        new winston.transports.Console()
    ]
});

// ============================================================
// CONFIGURAÇÃO BLOCKCHAIN
// ============================================================
const PROVIDER_URL = process.env.PROVIDER_URL || 'https://mainnet.infura.io/v3/YOUR_KEY';
const PRIVATE_KEY = process.env.BANK_PRIVATE_KEY; // Chave do operador do banco
const GTK_TOKEN_ADDRESS = process.env.GTK_TOKEN_ADDRESS;
const GTK_BANK_ADDRESS = process.env.GTK_BANK_ADDRESS;
const USDT_ADDRESS = process.env.USDT_ADDRESS || '0xdAC17F958D2ee523a2206206994597C13D831ec7';

const provider = new ethers.JsonRpcProvider(PROVIDER_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

// ABIs (simplificados - usar ABI completo em produção)
const GTK_TOKEN_ABI = [
    "function mint(address to, uint256 amount, uint256 goldGrams, bytes32 depositRef) external",
    "function burn(uint256 amount, uint256 goldGrams, bytes32 withdrawalRef) external",
    "function balanceOf(address account) view returns (uint256)",
    "function totalSupply() view returns (uint256)",
    "function totalGoldReserves() view returns (uint256)",
    "function goldPricePerGram() view returns (uint256)",
    "function getTokenValueInUSD(uint256 amountGrams) view returns (uint256)",
    "function isFullyBacked() view returns (bool)",
    "function blacklisted(address) view returns (bool)",
    "function kycTier(address) view returns (uint8)",
    "event TokensMinted(address indexed to, uint256 amountGrams, uint256 goldPriceAtMint)",
    "event TokensBurned(address indexed from, uint256 amountGrams, uint256 goldPriceAtBurn)"
];

const GTK_BANK_ABI = [
    "function processDeposit(bytes32 pixId, address user, uint256 brlAmount, uint256 usdtAmount, uint256 goldGrams, uint256 gtkAmount) external",
    "function requestWithdrawal(uint256 gtkAmount, uint256 goldGrams, bytes32 withdrawalId) external",
    "function processWithdrawalPix(bytes32 withdrawalId, address user, uint256 usdtAmount, string memory pixKey) external",
    "function processedDeposits(bytes32) view returns (bool)",
    "function depositFeeBps() view returns (uint256)",
    "function withdrawalFeeBps() view returns (uint256)",
    "event DepositProcessed(bytes32 indexed pixId, address indexed user, uint256 brlAmount, uint256 gtkAmount)",
    "event WithdrawalRequested(bytes32 indexed withdrawalId, address indexed user, uint256 gtkAmount, uint256 usdtAmount)"
];

const USDT_ABI = [
    "function transferFrom(address sender, address recipient, uint256 amount) external returns (bool)",
    "function transfer(address recipient, uint256 amount) external returns (bool)",
    "function balanceOf(address account) view returns (uint256)",
    "function approve(address spender, uint256 amount) external returns (bool)"
];

const gtkToken = new ethers.Contract(GTK_TOKEN_ADDRESS, GTK_TOKEN_ABI, wallet);
const gtkBank = new ethers.Contract(GTK_BANK_ADDRESS, GTK_BANK_ABI, wallet);
const usdt = new ethers.Contract(USDT_ADDRESS, USDT_ABI, wallet);

// ============================================================
// CONFIGURAÇÃO SERVIDOR
// ============================================================
const app = express();
app.use(helmet());
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['https://gtk.bank'],
    credentials: true
}));
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100, // limita cada IP a 100 requests por windowMs
    message: 'Too many requests, please try again later.'
});
app.use('/api/', limiter);

// ============================================================
// MIDDLEWARE DE AUTENTICAÇÃO
// ============================================================
const authenticate = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

const requireKYC = async (req, res, next) => {
    const { userAddress } = req.body;
    if (!userAddress) {
        return res.status(400).json({ error: 'User address required' });
    }

    try {
        const tier = await gtkToken.kycTier(userAddress);
        if (tier === 0) {
            return res.status(403).json({ error: 'KYC not verified' });
        }
        req.kycTier = tier;
        next();
    } catch (error) {
        logger.error('KYC check failed:', error);
        return res.status(500).json({ error: 'KYC verification failed' });
    }
};

// ============================================================
// SERVIÇO PIX (Simulação - integrar com gateway real)
// ============================================================
class PixService {
    constructor() {
        this.pendingTransactions = new Map();
    }

    async verifyPayment(pixId) {
        // TODO: Integrar com gateway PIX (Cielo, PagSeguro, etc.)
        // Por enquanto, simula verificação
        return {
            status: 'confirmed',
            amount: 1000.00,
            currency: 'BRL',
            payerDocument: '12345678900',
            timestamp: new Date().toISOString()
        };
    }

    async getExchangeRate() {
        // TODO: Integrar com serviço de câmbio
        // Taxa BRL/USD simulada
        return {
            brlToUsd: 0.20,
            usdToBrl: 5.00,
            timestamp: new Date().toISOString()
        };
    }

    generatePixId() {
        return crypto.randomBytes(32).toString('hex');
    }
}

const pixService = new PixService();

// ============================================================
// ROTAS DA API
// ============================================================

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        network: process.env.NETWORK || 'mainnet'
    });
});

// Obter informações do sistema
app.get('/api/v1/system/info', authenticate, async (req, res) => {
    try {
        const [totalSupply, totalGold, goldPrice, isBacked] = await Promise.all([
            gtkToken.totalSupply(),
            gtkToken.totalGoldReserves(),
            gtkToken.goldPricePerGram(),
            gtkToken.isFullyBacked()
        ]);

        res.json({
            totalSupply: ethers.formatUnits(totalSupply, 18),
            totalGoldReserves: ethers.formatUnits(totalGold, 18),
            goldPricePerGram: (Number(goldPrice) / 10**8).toFixed(2),
            isFullyBacked: isBacked,
            reserveRatio: totalGold > 0 ? ((Number(totalGold) / Number(totalSupply)) * 100).toFixed(2) + '%' : 'N/A',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('System info error:', error);
        res.status(500).json({ error: 'Failed to fetch system info' });
    }
});

// Criar PIX para depósito
app.post('/api/v1/deposit/pix/create', authenticate, requireKYC, async (req, res) => {
    try {
        const { userAddress, amountBRL } = req.body;

        if (!amountBRL || amountBRL <= 0) {
            return res.status(400).json({ error: 'Invalid amount' });
        }

        const pixId = pixService.generatePixId();
        const exchangeRate = await pixService.getExchangeRate();
        const amountUSD = amountBRL * exchangeRate.brlToUsd;
        const amountUSDT = Math.floor(amountUSD * 10**6); // USDT tem 6 decimais

        // Salva transação pendente
        pixService.pendingTransactions.set(pixId, {
            userAddress,
            amountBRL,
            amountUSDT,
            status: 'pending',
            createdAt: new Date().toISOString()
        });

        // TODO: Gerar QR Code PIX real via gateway
        const pixCopyPaste = `00020126580014BR.GOV.PIX0136${pixId}520400005303986540${amountBRL.toFixed(2)}5802BR5913GTK Bank6008Sao Paulo62070503***6304`;

        res.json({
            pixId,
            pixCopyPaste,
            qrCode: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(pixCopyPaste)}`,
            amountBRL,
            amountUSD: amountUSD.toFixed(2),
            amountUSDT,
            exchangeRate: exchangeRate.brlToUsd,
            expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30 minutos
        });
    } catch (error) {
        logger.error('PIX creation error:', error);
        res.status(500).json({ error: 'Failed to create PIX' });
    }
});

// Webhook para confirmação PIX (chamado pelo gateway de pagamento)
app.post('/api/v1/deposit/pix/webhook', async (req, res) => {
    try {
        const { pixId, status, amount, payerDocument } = req.body;

        // Verifica se PIX existe
        const pendingTx = pixService.pendingTransactions.get(pixId);
        if (!pendingTx) {
            return res.status(404).json({ error: 'PIX not found' });
        }

        if (status !== 'confirmed') {
            return res.json({ status: 'pending', message: 'Waiting for confirmation' });
        }

        // Verifica se já processado na blockchain
        const isProcessed = await gtkBank.processedDeposits(`0x${pixId}`);
        if (isProcessed) {
            return res.status(409).json({ error: 'PIX already processed' });
        }

        // Verifica KYC
        const tier = await gtkToken.kycTier(pendingTx.userAddress);
        if (tier === 0) {
            logger.warn(`KYC not verified for ${pendingTx.userAddress}`);
            return res.status(403).json({ error: 'KYC not verified' });
        }

        // Verifica blacklist
        const bl = await gtkToken.blacklisted(pendingTx.userAddress);
        if (bl) {
            logger.warn(`Blacklisted address attempted deposit: ${pendingTx.userAddress}`);
            return res.status(403).json({ error: 'Account blacklisted' });
        }

        // Verifica reservas
        const totalSupply = await gtkToken.totalSupply();
        const totalGold = await gtkToken.totalGoldReserves();
        const goldPrice = await gtkToken.goldPricePerGram();

        // Calcula GTK a ser emitido
        const gtkAmount = (BigInt(pendingTx.amountUSDT) * BigInt(10**20)) / goldPrice;
        const goldGrams = gtkAmount;

        if (totalSupply + gtkAmount > totalGold) {
            logger.error('Insufficient gold reserves for minting');
            return res.status(503).json({ error: 'Insufficient reserves' });
        }

        // Executa mint na blockchain
        const tx = await gtkBank.processDeposit(
            `0x${pixId}`,
            pendingTx.userAddress,
            pendingTx.amountBRL,
            pendingTx.amountUSDT,
            goldGrams,
            gtkAmount
        );

        const receipt = await tx.wait();

        // Atualiza status
        pendingTx.status = 'completed';
        pendingTx.blockchainTxHash = receipt.hash;
        pendingTx.completedAt = new Date().toISOString();

        logger.info(`Deposit processed: ${pixId}, TX: ${receipt.hash}`);

        res.json({
            status: 'completed',
            pixId,
            blockchainTxHash: receipt.hash,
            gtkAmount: ethers.formatUnits(gtkAmount, 18),
            goldPrice: (Number(goldPrice) / 10**8).toFixed(2),
            userAddress: pendingTx.userAddress
        });
    } catch (error) {
        logger.error('PIX webhook error:', error);
        res.status(500).json({ error: 'Processing failed', details: error.message });
    }
});

// Solicitar saque (PIX)
app.post('/api/v1/withdrawal/pix', authenticate, requireKYC, async (req, res) => {
    try {
        const { userAddress, gtkAmount, pixKey } = req.body;

        if (!gtkAmount || gtkAmount <= 0) {
            return res.status(400).json({ error: 'Invalid amount' });
        }

        if (!pixKey || pixKey.length < 11) {
            return res.status(400).json({ error: 'Invalid PIX key' });
        }

        // Verifica saldo
        const balance = await gtkToken.balanceOf(userAddress);
        const amountWei = ethers.parseUnits(gtkAmount.toString(), 18);

        if (balance < amountWei) {
            return res.status(400).json({ error: 'Insufficient GTK balance' });
        }

        // Verifica se não está blacklistado
        const bl = await gtkToken.blacklisted(userAddress);
        if (bl) {
            return res.status(403).json({ error: 'Account blacklisted' });
        }

        // Executa queima e processamento
        const withdrawalId = ethers.encodeBytes32String(crypto.randomUUID().slice(0, 32));
        const tx = await gtkBank.requestWithdrawal(amountWei, amountWei, withdrawalId);
        const receipt = await tx.wait();

        // TODO: Integrar com gateway PIX para envio real de BRL

        res.json({
            status: 'processing',
            withdrawalId: crypto.randomUUID(),
            blockchainTxHash: receipt.hash,
            gtkAmount,
            pixKey,
            estimatedArrival: '1-2 business days'
        });
    } catch (error) {
        logger.error('Withdrawal error:', error);
        res.status(500).json({ error: 'Withdrawal failed', details: error.message });
    }
});

// Verificar saldo
app.get('/api/v1/balance/:address', authenticate, async (req, res) => {
    try {
        const { address } = req.params;

        if (!ethers.isAddress(address)) {
            return res.status(400).json({ error: 'Invalid address' });
        }

        const [gtkBalance, usdtBalance, goldPrice] = await Promise.all([
            gtkToken.balanceOf(address),
            usdt.balanceOf(address),
            gtkToken.goldPricePerGram()
        ]);

        const gtkValueUSD = (Number(gtkBalance) * Number(goldPrice)) / 10**26;

        res.json({
            address,
            gtkBalance: ethers.formatUnits(gtkBalance, 18),
            usdtBalance: ethers.formatUnits(usdtBalance, 6),
            estimatedUSDValue: gtkValueUSD.toFixed(2),
            goldPricePerGram: (Number(goldPrice) / 10**8).toFixed(2)
        });
    } catch (error) {
        logger.error('Balance check error:', error);
        res.status(500).json({ error: 'Failed to fetch balance' });
    }
});

// Verificar status de PIX
app.get('/api/v1/deposit/pix/:pixId/status', authenticate, async (req, res) => {
    try {
        const { pixId } = req.params;

        const pendingTx = pixService.pendingTransactions.get(pixId);
        const isProcessed = await gtkBank.processedDeposits(`0x${pixId}`);

        if (isProcessed) {
            return res.json({ status: 'completed', pixId });
        }

        if (pendingTx) {
            return res.json({ 
                status: pendingTx.status, 
                pixId,
                createdAt: pendingTx.createdAt
            });
        }

        res.status(404).json({ error: 'PIX not found' });
    } catch (error) {
        logger.error('PIX status error:', error);
        res.status(500).json({ error: 'Failed to check status' });
    }
});

// ============================================================
// CRON JOB - SINCRONIZAÇÃO DE PREÇOS
// ============================================================
const updateGoldPrice = async () => {
    try {
        // TODO: Integrar com múltiplas fontes de preço
        // 1. Chainlink XAU/USD
        // 2. Bloomberg API
        // 3. LBMA fix

        const sources = [
            { name: 'chainlink', url: 'https://api.chain.link/v1/price/XAU/USD' },
            { name: 'lbma', url: 'https://www.lbma.org.uk/prices' }
        ];

        let prices = [];

        for (const source of sources) {
            try {
                const response = await axios.get(source.url, { timeout: 5000 });
                prices.push({
                    source: source.name,
                    price: response.data.price,
                    timestamp: new Date().toISOString()
                });
            } catch (e) {
                logger.warn(`Price source ${source.name} failed: ${e.message}`);
            }
        }

        if (prices.length === 0) {
            throw new Error('All price sources failed');
        }

        // Calcula média e converte para preço por grama
        const avgPricePerOz = prices.reduce((sum, p) => sum + p.price, 0) / prices.length;
        const pricePerGram = Math.floor((avgPricePerOz * 10**8) / 31.10347680);

        // Atualiza no contrato
        const tx = await gtkToken.updateGoldPrice(pricePerGram);
        await tx.wait();

        logger.info(`Gold price updated: $${(pricePerGram / 10**8).toFixed(2)}/gram`);
    } catch (error) {
        logger.error('Price update failed:', error);
    }
};

// Atualiza preço a cada 15 minutos
setInterval(updateGoldPrice, 15 * 60 * 1000);

// ============================================================
// INICIALIZAÇÃO
// ============================================================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    logger.info(`GTK Bank API running on port ${PORT}`);
    logger.info(`Network: ${process.env.NETWORK || 'mainnet'}`);
    logger.info(`GTK Token: ${GTK_TOKEN_ADDRESS}`);
    logger.info(`GTK Bank: ${GTK_BANK_ADDRESS}`);
});

module.exports = app;
