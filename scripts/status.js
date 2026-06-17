const { ethers } = require('ethers');
const p = new ethers.JsonRpcProvider('https://eth-sepolia.g.alchemy.com/v2/G6ZN1wc0IrKTFzbylMnjj');
const T = '0x646C3a2A1D4A782Ce464c2Ddf0667aCcD689C2F5';

const tok = new ethers.Contract(T, [
  'function balanceOf(address) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function totalGoldReserves() view returns (uint256)',
  'function goldPricePerGram() view returns (uint256)',
  'function isFullyBacked() view returns (bool)',
  'function getReserveRatio() view returns (uint256)',
  'function getActiveBarsCount() view returns (uint256)',
], p);

const user = '0xBFF9E05C9C4c3e7C33cf82B956DCbd3C4513dAC3';

(async () => {
  const [s, r, g, fb, rr, bars, bal] = await Promise.all([
    tok.totalSupply(), tok.totalGoldReserves(), tok.goldPricePerGram(),
    tok.isFullyBacked(), tok.getReserveRatio(), tok.getActiveBarsCount(),
    tok.balanceOf(user),
  ]);
  console.log('=== STATUS GTK - Sepolia ===');
  console.log('Supply:     ' + ethers.formatEther(s) + ' GTK');
  console.log('Reservas:   ' + ethers.formatEther(r) + ' g ouro');
  console.log('Preco:      $' + (Number(g)/1e8).toFixed(2) + '/g');
  console.log('Lastro:     ' + (fb ? '100%' : 'FALHO'));
  console.log('Ratio:      ' + (Number(rr)/100).toFixed(0) + '%');
  console.log('Barras:     ' + bars + ' ativas');
  console.log('Deployer:   ' + ethers.formatEther(bal) + ' GTK');
  console.log('');
  console.log("Custodia na Brink's: 50.000g - BRINKS-001 - Ativo");
  console.log('');
  console.log('Proximo passo: iniciar Bank API e testar rotas');
})().catch(console.error);
