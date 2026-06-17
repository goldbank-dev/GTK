import React from 'react';
import logoImg from '../../assets/icon.png';

export default function Header({ account, chainId, onConnect, onDisconnect }) {
  const networkLabel = {
    1: 'Mainnet', 5: 'Goerli', 11155111: 'Sepolia', 137: 'Polygon', 56: 'BSC', 42161: 'Arbitrum',
  }[chainId] || 'Unknown';

  return (
    <header className="header">
      <div className="header-left">
        <div className="logo">
          <img src={logoImg} alt="GTK Logo" className="logo-img" style={{ width: '40px', height: '40px' }} />
          <div>
            <h1 className="logo-title">GTK Bank</h1>
            <span className="logo-sub">Gold Token Dashboard</span>
          </div>
        </div>
      </div>
      <div className="header-right">
        {chainId > 0 && (
          <span className={`network-badge ${chainId === 1 ? 'mainnet' : 'testnet'}`}>
            <span className="dot" />
            {networkLabel}
          </span>
        )}
        {account ? (
          <div className="wallet-info">
            <span className="wallet-dot" />
            <span className="wallet-addr">{account.slice(0, 6)}...{account.slice(-4)}</span>
            <button className="btn-ghost btn-sm" onClick={onDisconnect}>Exit</button>
          </div>
        ) : (
          <button className="btn-gold" onClick={onConnect}>Connect</button>
        )}
      </div>
    </header>
  );
}
