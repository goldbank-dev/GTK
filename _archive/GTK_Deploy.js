
// ============================================================
// GTK DEPLOY SCRIPT - Hardhat/Foundry
// ============================================================
// npm install @openzeppelin/contracts-upgradeable @nomicfoundation/hardhat-toolbox
// ============================================================

const { ethers, upgrades } = require("hardhat");
const fs = require('fs');

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with account:", deployer.address);

    // ============================================================
    // 1. DEPLOY ORÁCULO DE PREÇO
    // ============================================================
    // Chainlink XAU/USD em Ethereum Mainnet: 0x214eD9Da11D2fbe466a49c97E6fBf182E197cD8C
    // Para testnet Sepolia: 0xC5981F461d74c46bE4c9bD6bDd9EeD708f0dC1B2

    const CHAINLINK_XAU_USD = "0x214eD9Da11D2fbe466a49c97E6fBf182E197cD8C";

    const GTKPriceOracle = await ethers.getContractFactory("GTKPriceOracle");
    const oracle = await GTKPriceOracle.deploy(CHAINLINK_XAU_USD);
    await oracle.waitForDeployment();
    console.log("✅ GTKPriceOracle deployed to:", await oracle.getAddress());

    // ============================================================
    // 2. DEPLOY TOKEN GTK (UPGRADEABLE PROXY)
    // ============================================================

    const GTKToken = await ethers.getContractFactory("GTKToken");
    const gtkToken = await upgrades.deployProxy(GTKToken, [
        "Gold Token",           // name
        "GTK",                  // symbol
        deployer.address,       // defaultAdmin
        await oracle.getAddress() // priceOracle
    ], {
        initializer: "initialize",
        kind: "uups"
    });
    await gtkToken.waitForDeployment();
    console.log("✅ GTKToken deployed to:", await gtkToken.getAddress());

    // ============================================================
    // 3. DEPLOY GTK BANK
    // ============================================================

    const USDT_ADDRESS = "0xdAC17F958D2ee523a2206206994597C13D831ec7"; // Mainnet USDT

    const GTKBank = await ethers.getContractFactory("GTKBank");
    const gtkBank = await GTKBank.deploy(
        await gtkToken.getAddress(),
        USDT_ADDRESS
    );
    await gtkBank.waitForDeployment();
    console.log("✅ GTKBank deployed to:", await gtkBank.getAddress());

    // ============================================================
    // 4. CONFIGURAÇÃO DE PERMISSÕES
    // ============================================================

    // Concede MINTER_ROLE ao GTKBank para mint automático
    await (await gtkToken.grantRole(
        await gtkToken.MINTER_ROLE(), 
        await gtkBank.getAddress()
    )).wait();
    console.log("✅ MINTER_ROLE granted to GTKBank");

    // Concede BURNER_ROLE ao GTKBank
    await (await gtkToken.grantRole(
        await gtkToken.BURNER_ROLE(), 
        await gtkBank.getAddress()
    )).wait();
    console.log("✅ BURNER_ROLE granted to GTKBank");

    // Concede ORACLE_ROLE ao deployer (substituir por multisig em produção)
    await (await gtkToken.grantRole(
        await gtkToken.ORACLE_ROLE(), 
        deployer.address
    )).wait();
    console.log("✅ ORACLE_ROLE granted to deployer");

    // Concede CUSTODIAN_ROLE ao deployer
    await (await gtkToken.grantRole(
        await gtkToken.CUSTODIAN_ROLE(), 
        deployer.address
    )).wait();
    console.log("✅ CUSTODIAN_ROLE granted to deployer");

    // Concede COMPLIANCE_ROLE ao deployer
    await (await gtkToken.grantRole(
        await gtkToken.COMPLIANCE_ROLE(), 
        deployer.address
    )).wait();
    console.log("✅ COMPLIANCE_ROLE granted to deployer");

    // ============================================================
    // 5. CONFIGURAÇÃO INICIAL DO ORÁCULO
    // ============================================================

    // Preço inicial do ouro: ~$65/grama (com 8 decimais)
    const initialPrice = 6500000000; // $65.00
    await (await oracle.updateManualPrice(initialPrice)).wait();
    console.log("✅ Initial gold price set:", initialPrice);

    // Atualiza preço no token
    await (await gtkToken.updateGoldPrice(initialPrice)).wait();
    console.log("✅ Gold price synced to GTKToken");

    // ============================================================
    // 6. SALVA ENDEREÇOS PARA REFERÊNCIA
    // ============================================================

    const deploymentInfo = {
        network: network.name,
        deployer: deployer.address,
        contracts: {
            GTKPriceOracle: await oracle.getAddress(),
            GTKToken: await gtkToken.getAddress(),
            GTKBank: await gtkBank.getAddress(),
            USDT: USDT_ADDRESS
        },
        timestamp: new Date().toISOString()
    };

    fs.writeFileSync(
        `deployment-${network.name}.json`, 
        JSON.stringify(deploymentInfo, null, 2)
    );
    console.log("\n📄 Deployment info saved to deployment-${network.name}.json");

    // ============================================================
    // 7. VERIFICAÇÃO EM PRODUÇÃO
    // ============================================================

    console.log("\n🔍 Para verificar no Etherscan:");
    console.log(`npx hardhat verify --network ${network.name} ${await oracle.getAddress()} ${CHAINLINK_XAU_USD}`);
    console.log(`npx hardhat verify --network ${network.name} ${await gtkBank.getAddress()} ${await gtkToken.getAddress()} ${USDT_ADDRESS}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
