const { ethers } = require('ethers');
const config = require('./index');

const providerUrl = (config.blockchain.providerUrl || '').trim();
const bankKey    = (config.blockchain.bankPrivateKey || '').trim();

if (!providerUrl) throw new Error('MAINNET_RPC / SEPOLIA_RPC not set');
if (!bankKey)     throw new Error('BANK_PRIVATE_KEY not set');

const provider = new ethers.JsonRpcProvider(providerUrl);
const wallet   = new ethers.Wallet(bankKey, provider);

const GTK_TOKEN_ABI = [
  "function mint(address to, uint256 amount, uint256 goldGrams, bytes32 depositRef) external",
  "function burn(uint256 amount, uint256 goldGrams, bytes32 withdrawalRef) external",
  "function balanceOf(address account) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function totalGoldReserves() view returns (uint256)",
  "function goldPricePerGram() view returns (uint256)",
  "function getTokenValueInUSD(uint256 amountGrams) view returns (uint256)",
  "function isFullyBacked() view returns (bool)",
  "function getReserveRatio() view returns (uint256)",
  "function blacklisted(address) view returns (bool)",
  "function kycTier(address) view returns (uint8)",
  "function updateGoldPrice(uint256) external",
  "event TokensMinted(address indexed to, uint256 amountGrams, uint256 goldPriceAtMint)",
  "event TokensBurned(address indexed from, uint256 amountGrams, uint256 goldPriceAtBurn)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
];

const GTK_BANK_ABI = [
  "function processDeposit(bytes32 pixId, address user, uint256 brlAmount, uint256 usdtAmount, uint256 goldGrams, uint256 gtkAmount) external",
  "function requestWithdrawal(uint256 gtkAmount, uint256 goldGrams, bytes32 withdrawalId) external",
  "function processWithdrawalPix(bytes32 withdrawalId, address user, uint256 usdtAmount, string memory pixKey) external",
  "function processedDeposits(bytes32) view returns (bool)",
  "function depositFeeBps() view returns (uint256)",
  "function withdrawalFeeBps() view returns (uint256)",
  "function deposits(bytes32) view returns (address,uint256,uint256,uint256,uint256,uint256,bool)",
  "event DepositProcessed(bytes32 indexed pixId, address indexed user, uint256 brlAmount, uint256 gtkAmount)",
  "event WithdrawalRequested(bytes32 indexed withdrawalId, address indexed user, uint256 gtkAmount, uint256 usdtAmount)",
];

const USDT_ABI = [
  "function transferFrom(address sender, address recipient, uint256 amount) external returns (bool)",
  "function transfer(address recipient, uint256 amount) external returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function decimals() view returns (uint8)",
];

const gtkToken = new ethers.Contract(
  config.blockchain.gtkTokenAddress,
  GTK_TOKEN_ABI,
  wallet
);

const gtkBank = new ethers.Contract(
  config.blockchain.gtkBankAddress,
  GTK_BANK_ABI,
  wallet
);

const usdt = new ethers.Contract(
  config.blockchain.usdtAddress,
  USDT_ABI,
  wallet
);

module.exports = {
  provider,
  wallet,
  gtkToken,
  gtkBank,
  usdt,
  ethers,
};
