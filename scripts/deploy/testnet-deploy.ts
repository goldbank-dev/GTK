import { ethers, upgrades, run } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  // Sepolia Chainlink XAU/USD feed
  const CHAINLINK_XAU_USD = "0xC5981F461d74c46eB4b0CF3f4Ec79f025573B0Ea";
  // Sepolia USDT (mock)
  const USDT_ADDRESS = "0x7169D38820dfd117C3FA1f22a697dBA58d90BA06";

  // 1. Deploy PriceOracle
  const PriceOracle = await ethers.getContractFactory("GTKPriceOracle");
  const oracle = await PriceOracle.deploy(CHAINLINK_XAU_USD);
  await oracle.waitForDeployment();
  console.log("GTKPriceOracle:", await oracle.getAddress());

  // 2. Deploy GTKToken (upgradeable proxy)
  const GTKToken = await ethers.getContractFactory("GTKToken");
  const gtkToken = await upgrades.deployProxy(
    GTKToken,
    [deployer.address, await oracle.getAddress()],
    { kind: "uups", initializer: "initialize" }
  );
  await gtkToken.waitForDeployment();
  console.log("GTKToken proxy:", await gtkToken.getAddress());

  // 3. Deploy GTKBank (upgradeable proxy)
  const GTKBank = await ethers.getContractFactory("GTKBank");
  const gtkBank = await upgrades.deployProxy(
    GTKBank,
    [await gtkToken.getAddress(), USDT_ADDRESS, deployer.address],
    { kind: "uups", initializer: "initialize" }
  );
  await gtkBank.waitForDeployment();
  console.log("GTKBank proxy:", await gtkBank.getAddress());

  // 4. Grant MINTER and BURNER roles to GTKBank
  await gtkToken.grantRole(await gtkToken.MINTER_ROLE(), await gtkBank.getAddress());
  await gtkToken.grantRole(await gtkToken.BURNER_ROLE(), await gtkBank.getAddress());
  console.log("Roles granted to GTKBank");

  // 5. Set initial price via Oracle
  // ~$65/grama com 8 decimais
  const initialPrice = ethers.parseUnits("65", 8);
  await oracle.setManualPrice(initialPrice);

  // Sync price to token
  await gtkToken.updateGoldPrice(initialPrice);
  console.log("Initial gold price set");

  // 6. Grant PRICE_UPDATER_ROLE to deployer for ongoing updates
  await oracle.grantRole(await oracle.PRICE_UPDATER_ROLE(), deployer.address);
  console.log("PRICE_UPDATER_ROLE granted");

  // 7. Save deployment info
  const info = {
    network: "sepolia",
    deployer: deployer.address,
    contracts: {
      GTKPriceOracle: await oracle.getAddress(),
      GTKToken: await gtkToken.getAddress(),
      GTKBank: await gtkBank.getAddress(),
      USDT: USDT_ADDRESS,
    },
  };
  console.log("\nDeployment complete:", JSON.stringify(info, null, 2));

  // 8. Verify on Etherscan
  console.log("\nVerifying contracts...");
  try {
    await run("verify:verify", {
      address: await oracle.getAddress(),
      constructorArguments: [CHAINLINK_XAU_USD],
    });
  } catch (e) {
    console.log("Oracle verify skipped:", e.message);
  }
  try {
    await run("verify:verify", {
      address: await gtkToken.getAddress(),
      constructorArguments: [],
    });
  } catch (e) {
    console.log("Token verify skipped:", e.message);
  }
  try {
    await run("verify:verify", {
      address: await gtkBank.getAddress(),
      constructorArguments: [],
    });
  } catch (e) {
    console.log("Bank verify skipped:", e.message);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
