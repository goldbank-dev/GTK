import { ethers, upgrades, run } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  // Mainnet Chainlink XAU/USD feed (fonte: reference-data-directory.vercel.app)
  const CHAINLINK_XAU_USD = "0x214eD9Da11D2fbe465a6fc601a91E62EbEc1a0D6";
  // Mainnet USDT
  const USDT_ADDRESS = "0xdAC17F958D2ee523a2206206994597C13D831ec7";

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

  // 5. Set initial price
  const initialPrice = ethers.parseUnits("65", 8);
  await oracle.setManualPrice(initialPrice);
  await gtkToken.updateGoldPrice(initialPrice);
  console.log("Initial gold price set");

  // 6. Grant PRICE_UPDATER_ROLE
  await oracle.grantRole(await oracle.PRICE_UPDATER_ROLE(), deployer.address);

  // 7. Save deployment info
  const info = {
    network: "mainnet",
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
  await run("verify:verify", {
    address: await oracle.getAddress(),
    constructorArguments: [CHAINLINK_XAU_USD],
  });
  await run("verify:verify", {
    address: await gtkToken.getAddress(),
    constructorArguments: [],
  });
  await run("verify:verify", {
    address: await gtkBank.getAddress(),
    constructorArguments: [],
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
