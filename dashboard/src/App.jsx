import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import Sidebar from './components/Sidebar';
import Overview from './components/Overview';
import Deposit from './components/Deposit';
import Withdraw from './components/Withdraw';
import Redemption from './components/Redemption';
import Custody from './components/Custody';
import Transactions from './components/Transactions';
import Admin from './components/Admin';
import Header from './components/Header';
import logoImg from '../assets/icon.png';
import './styles/global.css';

const GTK_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function goldPricePerGram() view returns (uint256)',
  'function totalGoldReserves() view returns (uint256)',
  'function isFullyBacked() view returns (bool)',
  'function getReserveRatio() view returns (uint256)',
  'function getTokenValueInUSD(uint256) view returns (uint256)',
  'function blacklisted(address) view returns (bool)',
  'function kycTier(address) view returns (uint8)',
  'function getActiveBarsCount() view returns (uint256)',
  'function activeBarSerials(uint256) view returns (bytes32)',
  'function getCustodyDetails(bytes32) view returns (tuple(bytes32 barSerialNumber, uint256 weightGrams, uint256 purity, string vaultLocation, uint256 depositedAt, bool isActive))',
  'function requestRedemption(uint256,string) returns (uint256)',
];

const TOKEN_ADDR = import.meta.env.VITE_GTK_TOKEN_ADDRESS || '0x646C3a2A1D4A782Ce464c2Ddf0667aCcD689C2F5';
const API_URL = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_API_KEY || '';

async function api(endpoint, opts = {}) {
  const url = `${API_URL}${endpoint}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, ...opts.headers },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export default function App() {
  const [account, setAccount] = useState(null);
  const [provider, setProvider] = useState(null);
  const [chainId, setChainId] = useState(0);
  const [tab, setTab] = useState('overview');
  const [error, setError] = useState(null);
  const [systemInfo, setSystemInfo] = useState(null);

  useEffect(() => {
    const fetchSys = () => api('/api/v1/system/info').then(setSystemInfo).catch(() => {});
    fetchSys();
    const iv = setInterval(fetchSys, 30000);
    return () => clearInterval(iv);
  }, []);

  const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      if (isMobile) {
        setError(
          'MetaMask not detected. ' +
          '<a href="https://metamask.io/download/" target="_blank" style="color:#ffd700">Install MetaMask</a> ' +
          'or open this page in the MetaMask browser.'
        );
        try { window.location.href = 'metamask://dapp/' + window.location.host + window.location.pathname; } catch (_) {}
      } else {
        setError(
          'MetaMask not detected. ' +
          '<a href="https://metamask.io/download/" target="_blank" style="color:#ffd700">Install MetaMask</a> ' +
          'extension and reload the page.'
        );
      }
      return;
    }
    try {
      const p = new ethers.BrowserProvider(window.ethereum);
      const accounts = await p.send('eth_requestAccounts', []);
      const net = await p.getNetwork();
      setProvider(p);
      setAccount(accounts[0]);
      setChainId(Number(net.chainId));
      setError(null);
    } catch (e) { setError('Connection failed: ' + e.message); }
  }, [isMobile]);

  const disconnect = useCallback(() => {
    setAccount(null); setProvider(null);
  }, []);

  useEffect(() => {
    if (!window.ethereum) return;
    window.ethereum.on('accountsChanged', (accounts) => {
      if (accounts.length === 0) { setAccount(null); setProvider(null); }
      else setAccount(accounts[0]);
    });
    window.ethereum.on('chainChanged', () => window.location.reload());
  }, []);

  const signer = account && provider ? provider.getSigner() : null;
  const token = account && provider ? new ethers.Contract(TOKEN_ADDR, GTK_ABI, provider) : null;

  const isWrongNetwork = account && chainId !== 0 && chainId !== 11155111;

  return (
    <div className="app">
      <Header account={account} chainId={chainId} onConnect={connect} onDisconnect={disconnect} />
      {error && (
        <div className="error-bar">
          <span dangerouslySetInnerHTML={{ __html: error }} />
          <button className="error-close" onClick={() => setError(null)}>×</button>
        </div>
      )}
      {isWrongNetwork && (
        <div className="error-bar warning">
          <span>⚠️ <strong>Wrong Network:</strong> Please switch your MetaMask to <strong>Sepolia Testnet</strong>.</span>
          <button className="btn-ghost btn-sm" style={{marginLeft: '10px', color: 'white', border: '1px solid white'}} 
            onClick={async () => {
              try {
                await window.ethereum.request({
                  method: 'wallet_switchEthereumChain',
                  params: [{ chainId: '0xaa36a7' }], // 11155111 in hex
                });
              } catch (e) {
                if (e.code === 4902) {
                  await window.ethereum.request({
                    method: 'wallet_addEthereumChain',
                    params: [{
                      chainId: '0xaa36a7',
                      chainName: 'Sepolia',
                      nativeCurrency: { name: 'Sepolia ETH', symbol: 'ETH', decimals: 18 },
                      rpcUrls: ['https://rpc.sepolia.org'],
                      blockExplorerUrls: ['https://sepolia.etherscan.io'],
                    }],
                  });
                }
              }
            }}>Switch to Sepolia</button>
        </div>
      )}
      {!account ? (
        <div className="welcome">
          <div className="welcome-card">
            <img src={logoImg} alt="GTK Logo" style={{ width: '80px', height: '80px', marginBottom: '20px' }} />
            <h1>GTK Bank</h1>
            <p>Gold-backed digital assets platform</p>
            <button className="btn-gold btn-lg" onClick={connect}>Connect Wallet</button>
            <div className="welcome-features">
              <div className="wf-item"><span>🔒</span> Non-custodial</div>
              <div className="wf-item"><span>🥇</span> 100% Gold Backed</div>
              <div className="wf-item"><span>⚡</span> Instant PIX</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="layout">
          <Sidebar active={tab} onChange={setTab} />
          <main className="content">
            {tab === 'overview' && <Overview account={account} provider={provider} token={token} signer={signer} api={api} connect={connect} onNavigate={setTab} systemInfo={systemInfo} />}
            {tab === 'deposit' && <Deposit account={account} token={token} api={api} systemInfo={systemInfo} />}
            {tab === 'withdraw' && <Withdraw account={account} token={token} api={api} signer={signer} systemInfo={systemInfo} />}
            {tab === 'redemption' && <Redemption account={account} token={token} signer={signer} />}
            {tab === 'custody' && <Custody token={token} />}
            {tab === 'history' && <Transactions account={account} token={token} provider={provider} />}
            {tab === 'admin' && <Admin api={api} token={token} chainId={chainId} />}
          </main>
        </div>
      )}
    </div>
  );
}
