const { ethers } = require('ethers');
const p = new ethers.JsonRpcProvider('https://eth-sepolia.g.alchemy.com/v2/G6ZN1wc0IrKTFzbylMnjj');
const wallet = new ethers.Wallet('0x036337fcc150d8e8708465c1d2f9968d767f54db57671749d967a6604bea5d6a', p);

const TOKEN = '0x646C3a2A1D4A782Ce464c2Ddf0667aCcD689C2F5';
const ORACLE = '0x8DA918381c9feC2a84F53a6ba07F9fA83E8FbD3d';

const tok = new ethers.Contract(TOKEN, [
  'function updateGoldPrice(uint256) external',
  'function goldPricePerGram() view returns (uint256)',
  'function requestRedemption(uint256,string) returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
], wallet);

(async () => {
  // Preco atual do ouro: ~$2,350/oz → $75.54/g
  const pricePerGram = ethers.parseUnits('75', 8);
  const tx = await tok.updateGoldPrice(pricePerGram);
  await tx.wait();
  console.log('Preco atualizado! TX:', tx.hash);

  const p2 = await tok.goldPricePerGram();
  console.log('Novo preco: $' + (Number(p2)/1e8).toFixed(2) + '/g');

  // Agora tenta resgate novamente
  console.log('');
  console.log('Solicitando resgate de 200g...');
  const tx2 = await tok.requestRedemption(
    ethers.parseEther('200'),
    'Av. Paulista, 1000 - Sao Paulo - Brasil'
  );
  await tx2.wait();
  console.log('Resgate solicitado! TX:', tx2.hash);

  const bal = await tok.balanceOf(wallet.address);
  console.log('Saldo apos resgate: ' + ethers.formatEther(bal) + ' GTK');
})().catch(console.error);
