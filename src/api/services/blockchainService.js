const { provider, wallet, gtkToken, gtkBank, usdt, ethers } = require('../config/blockchain');
const exchangeService = require('./exchangeService');
const logger = require('../utils/logger');

class BlockchainService {
  async getSystemInfo() {
    const [totalSupply, totalGold, goldPrice, isBacked, reserveRatio, rates] = await Promise.all([
      gtkToken.totalSupply(),
      gtkToken.totalGoldReserves(),
      gtkToken.goldPricePerGram(),
      gtkToken.isFullyBacked(),
      gtkToken.getReserveRatio(),
      exchangeService.getRate(),
    ]);

    return {
      totalSupply: ethers.formatUnits(totalSupply, 18),
      totalGoldReserves: ethers.formatUnits(totalGold, 18),
      goldPricePerGram: (Number(goldPrice) / 10 ** 8).toFixed(2),
      usdToBrl: rates.usdToBrl,
      isFullyBacked: isBacked,
      reserveRatio: totalGold > 0n
        ? ((Number(totalGold) / Number(totalSupply)) * 100).toFixed(2) + '%'
        : 'N/A',
    };
  }

  async getBalance(address) {
    if (!ethers.isAddress(address)) {
      throw new Error('Invalid address');
    }

    const [gtkBalance, usdtBalance, goldPrice] = await Promise.all([
      gtkToken.balanceOf(address),
      usdt.balanceOf(address),
      gtkToken.goldPricePerGram(),
    ]);

    const gtkFormatted = ethers.formatUnits(gtkBalance, 18);
    const gtkValueUSD = (Number(gtkFormatted) * Number(goldPrice)) / 10 ** 8;

    return {
      address,
      gtkBalance: gtkFormatted,
      usdtBalance: ethers.formatUnits(usdtBalance, 6),
      estimatedUSDValue: gtkValueUSD.toFixed(2),
      goldPricePerGram: (Number(goldPrice) / 10 ** 8).toFixed(2),
    };
  }

  async checkKYC(address) {
    const [tier, blacklisted] = await Promise.all([
      gtkToken.kycTier(address),
      gtkToken.blacklisted(address),
    ]);
    return { tier: Number(tier), isBlacklisted: blacklisted, isVerified: Number(tier) > 0 };
  }

  async processDeposit(pixId, userAddress, brlAmount, usdtAmount, goldGrams, gtkAmount) {
    logger.info(`Processing deposit: pixId=${pixId}, user=${userAddress}, brl=${brlAmount}`);

    const tx = await gtkBank.processDeposit(
      pixId,
      userAddress,
      brlAmount,
      usdtAmount,
      goldGrams,
      gtkAmount
    );
    const receipt = await tx.wait();

    logger.info(`Deposit processed: pixId=${pixId}, tx=${receipt.hash}`);
    return { hash: receipt.hash, blockNumber: receipt.blockNumber };
  }

  async requestWithdrawal(gtkAmount, goldGrams, withdrawalId) {
    logger.info(`Requesting withdrawal: id=${withdrawalId}, amount=${ethers.formatEther(gtkAmount)} GTK`);

    const tx = await gtkBank.requestWithdrawal(gtkAmount, goldGrams, withdrawalId);
    const receipt = await tx.wait();

    logger.info(`Withdrawal requested: id=${withdrawalId}, tx=${receipt.hash}`);
    return { hash: receipt.hash, blockNumber: receipt.blockNumber };
  }

  async checkDepositProcessed(pixId) {
    return gtkBank.processedDeposits(pixId);
  }

  async updateGoldPrice(pricePerGram) {
    logger.info(`Updating gold price to $${(Number(pricePerGram) / 10 ** 8).toFixed(2)}/g`);
    const tx = await gtkToken.updateGoldPrice(pricePerGram);
    const receipt = await tx.wait();
    logger.info(`Gold price updated: tx=${receipt.hash}`);
    return receipt;
  }

  getWalletAddress() {
    return wallet.address;
  }

  getNetwork() {
    return process.env.NETWORK || 'sepolia';
  }

  parseEther(value) {
    return ethers.parseEther(value.toString());
  }

  formatEther(value) {
    return ethers.formatEther(value);
  }

  encodeBytes32String(str) {
    return ethers.encodeBytes32String(str);
  }
}

module.exports = new BlockchainService();
