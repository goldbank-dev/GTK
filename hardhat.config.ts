import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-network-helpers";
import "@nomicfoundation/hardhat-verify";
import "@openzeppelin/hardhat-upgrades";
import * as dotenv from "dotenv";

// Suporta arquivo .env customizado via DOTENV_CONFIG_PATH
// Exemplo: DOTENV_CONFIG_PATH=.env.production.final npm run deploy:mainnet:prod
dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || ".env" });

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    mainnet: {
      url: process.env.MAINNET_RPC || "",
      accounts: process.env.DEPLOYER_PK ? [process.env.DEPLOYER_PK] : [],
    },
    sepolia: {
      url: process.env.SEPOLIA_RPC || "",
      accounts: process.env.DEPLOYER_PK_TESTNET ? [process.env.DEPLOYER_PK_TESTNET] : [],
    },
    arbitrumOne: {
      url: process.env.ARBITRUM_RPC || "",
      accounts: process.env.DEPLOYER_PK ? [process.env.DEPLOYER_PK] : [],
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_KEY || "",
  },
};

export default config;

config.paths = {
  tests: "./tests",
};