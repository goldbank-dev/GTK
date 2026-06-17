const { ethers } = require("ethers");
require("dotenv").config({ path: ".env.production.final" });

const TOKEN_ADDRESS = "0x8751264B0f82cfE5DD3ad941b4d28FD7a0f896EA";
const TREASURY     = "0x2700E01fEfC51De0A15FE5b54E81dfB066692594";

const TOKEN_ABI = [
  "function grantRole(bytes32 role, address account) external",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function MINTER_ROLE() view returns (bytes32)",
  "function CUSTODIAN_ROLE() view returns (bytes32)",
  "function COMPLIANCE_ROLE() view returns (bytes32)",
  "function depositGold(bytes32 barSerialNumber, uint256 weightGrams, uint256 purity, string vaultLocation) external",
  "function mint(address to, uint256 amount, uint256 goldGrams, bytes32 depositRef) external",
  "function setKycTier(address account, uint8 tier) external",
  "function kycTier(address account) view returns (uint8)",
  "function totalGoldReserves() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
];

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.MAINNET_RPC);
  const deployer  = new ethers.Wallet(process.env.DEPLOYER_PK, provider);
  const token     = new ethers.Contract(TOKEN_ADDRESS, TOKEN_ABI, deployer);

  const bal = await provider.getBalance(deployer.address);
  const fee = await provider.getFeeData();

  console.log("=== GTK GENESIS MINT ===");
  console.log("Deployer :", deployer.address);
  console.log("Saldo    :", ethers.formatEther(bal), "ETH");
  console.log("Gas price:", ethers.formatUnits(fee.gasPrice, "gwei"), "gwei\n");

  const MINTER_ROLE    = await token.MINTER_ROLE();
  const CUSTODIAN_ROLE = await token.CUSTODIAN_ROLE();
  const COMPLIANCE_ROLE= await token.COMPLIANCE_ROLE();

  // 1. Conceder roles ao deployer (já tem DEFAULT_ADMIN_ROLE)
  console.log("[1/5] Verificando roles...");
  for (const [name, role] of [
    ["CUSTODIAN_ROLE",  CUSTODIAN_ROLE],
    ["MINTER_ROLE",     MINTER_ROLE],
    ["COMPLIANCE_ROLE", COMPLIANCE_ROLE],
  ]) {
    if (!(await token.hasRole(role, deployer.address))) {
      const tx = await token.grantRole(role, deployer.address);
      await tx.wait();
      console.log(" ", name, "concedida ->", tx.hash);
    } else {
      console.log(" ", name, "ja ativa");
    }
  }

  // 2. KYC tier 1 para Treasury
  console.log("\n[2/5] KYC Treasury...");
  if ((await token.kycTier(TREASURY)) === 0n) {
    const tx = await token.setKycTier(TREASURY, 1);
    await tx.wait();
    console.log("  KYC Tier 1 definido ->", tx.hash);
  } else {
    console.log("  Treasury ja tem KYC");
  }

  // 3. Registrar barra genesis (weightGrams em wei — mesma unidade do token)
  // GTK-GENESIS-001 ja existe com 1n (erro de unidade). Registrar GTK-GENESIS-002 corretamente.
  console.log("\n[3/5] Registrando barra GTK-GENESIS-002 (1g com 18 decimais, pureza 99.99%)...");
  const WEIGHT_WEI  = ethers.parseUnits("1", 18); // 1 grama = 1 GTK = 10^18
  const BAR_SERIAL  = ethers.encodeBytes32String("GTK-GENESIS-002");
  const tx3 = await token.depositGold(BAR_SERIAL, WEIGHT_WEI, 9999n, "Sao Paulo BR - Genesis Vault");
  const rec3 = await tx3.wait();
  console.log("  Barra GTK-GENESIS-002 registrada ->", rec3.hash);

  // 4. Mint 1 GTK para Treasury
  console.log("\n[4/5] Mintando 1 GTK para Treasury...");
  const DEPOSIT_REF = ethers.encodeBytes32String("GENESIS-MINT-001");
  const tx4 = await token.mint(TREASURY, WEIGHT_WEI, WEIGHT_WEI, DEPOSIT_REF);
  const rec4 = await tx4.wait();
  console.log("  1 GTK mintado ->", rec4.hash);

  // 5. Status final
  console.log("\n[5/5] Status pos-mint:");
  const reserves = await token.totalGoldReserves();
  const supply   = await token.totalSupply();
  const tBal     = await token.balanceOf(TREASURY);
  console.log("  Reservas de ouro :", reserves.toString(), "g");
  console.log("  Supply GTK total :", ethers.formatUnits(supply, 18), "GTK");
  console.log("  Saldo Treasury   :", ethers.formatUnits(tBal, 18), "GTK");

  console.log("\n=== GENESIS MINT CONCLUIDO COM SUCESSO ===");
  console.log("Etherscan GTKToken:");
  console.log("  https://etherscan.io/token/" + TOKEN_ADDRESS);
}

main().catch((e) => { console.error(e); process.exit(1); });
