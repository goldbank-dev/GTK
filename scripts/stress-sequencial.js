const { ethers } = require('ethers');
const p = new ethers.JsonRpcProvider('https://eth-sepolia.g.alchemy.com/v2/G6ZN1wc0IrKTFzbylMnjj');
const wallet = new ethers.Wallet('0x036337fcc150d8e8708465c1d2f9968d767f54db57671749d967a6604bea5d6a', p);

const TOKEN = '0x646C3a2A1D4A782Ce464c2Ddf0667aCcD689C2F5';
const BANK = '0x938089e3C2514A088b26C6b813e51f3c1D0296dE';

const tok = new ethers.Contract(TOKEN, [
  'function updateGoldPrice(uint256) external',
  'function goldPricePerGram() view returns (uint256)',
  'function requestRedemption(uint256,string) returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function totalGoldReserves() view returns (uint256)',
  'function isFullyBacked() view returns (bool)',
  'function transfer(address,uint256) returns (bool)',
], wallet);

const recipients = [
  '0x04a8514542f2bFd68f26Ca3de3C9Ba00f947E9c7',  // bank_operator
  '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',  // hardhat #2
  '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',  // hardhat #3
];

(async () => {
  // Step 1: Update gold price
  const pricePerGram = ethers.parseUnits('75', 8);
  const tx = await tok.updateGoldPrice(pricePerGram);
  await tx.wait();
  console.log('1. Preco atualizado! TX:', tx.hash);

  const p2 = await tok.goldPricePerGram();
  console.log('   Novo preco: $' + (Number(p2)/1e8).toFixed(2) + '/g');

  // Step 2: Transfer to 3 recipients
  console.log('');
  console.log('2. Transferindo 50 GTK para cada destinatario...');
  for (const r of recipients) {
    const tx2 = await tok.transfer(r, ethers.parseEther('50'));
    await tx2.wait();
    const bal = await tok.balanceOf(r);
    console.log('   ' + r + ': ' + ethers.formatEther(bal) + ' GTK (TX: ' + tx2.hash + ')');
  }

  // Step 3: Physical redemption
  console.log('');
  console.log('3. Solicitando resgate fisico de 200g...');
  const tx3 = await tok.requestRedemption(
    ethers.parseEther('200'),
    'Av. Paulista, 1000 - Sao Paulo - Brasil'
  );
  await tx3.wait();
  console.log('   TX:', tx3.hash);

  const bal = await tok.balanceOf(wallet.address);
  const supply = await tok.totalSupply();
  const reserves = await tok.totalGoldReserves();
  const fb = await tok.isFullyBacked();
  console.log('');
  console.log('=== STATUS FINAL ===');
  console.log('Deployer:  ' + ethers.formatEther(bal) + ' GTK');
  console.log('Supply:    ' + ethers.formatEther(supply) + ' GTK');
  console.log('Reservas:  ' + ethers.formatEther(reserves) + ' g ouro');
  console.log('Lastro:    ' + (fb ? '100%' : 'FALHO'));
})().catch(console.error);
