const { ethers } = require('ethers');

async function main() {
  const provider = new ethers.JsonRpcProvider('https://eth-sepolia.g.alchemy.com/v2/G6ZN1wc0IrKTFzbylMnjj');
  const wallet = new ethers.Wallet('0x036337fcc150d8e8708465c1d2f9968d767f54db57671749d967a6604bea5d6a', provider);

  const TOKEN = '0x646C3a2A1D4A782Ce464c2Ddf0667aCcD689C2F5';
  const token = new ethers.Contract(TOKEN, [
    'function depositGold(bytes32,uint256,uint256,string) external',
    'function custodyRecords(bytes32) view returns (bytes32,uint256,uint256,string,uint256,bool)',
  ], wallet);

  const barSerial = ethers.encodeBytes32String('BRINKS-001');
  console.log("Depositando barra na Brink" + "'s...");
  const tx = await token.depositGold(barSerial, ethers.parseEther('50000'), 9999, "Brink's Vault Zurich");
  await tx.wait();
  console.log('TX:', tx.hash);

  const r = await token.custodyRecords(barSerial);
  console.log('Serial:  ' + ethers.hexlify(ethers.toBeArray(r[0])).slice(0, 18) + '...');
  console.log('Peso:    ' + ethers.formatEther(r[1]) + ' g');
  console.log('Pureza:  ' + (Number(r[2]) / 100) + '%');
  console.log('Vault:   ' + r[3]);
  console.log('Ativo:   ' + r[5]);
  console.log("\n✅ Ouro na Brink's registrado!");
}

main().catch(console.error);
