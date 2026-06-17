import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';

const fmt = (v, d = 4) => { const n = parseFloat(v); if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M'; if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K'; return n.toFixed(d); };
const usd = (v) => '$' + parseFloat(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brl = (v) => 'R$ ' + parseFloat(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Overview({ account, provider, token, signer, api, connect, onNavigate, systemInfo }) {
  const [data, setData] = useState({ balance: '0', price: 0, supply: '0', reserves: '0', backed: true, bars: 0, ratio: 'N/A', kyc: null, sys: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    let mounted = true;
    const fetch = async () => {
      try {
        const [bal, price, supply, reserves, backed, bars, ratio] = await Promise.all([
          token.balanceOf(account).catch(() => 0n),
          token.goldPricePerGram().catch(() => 0n),
          token.totalSupply().catch(() => 0n),
          token.totalGoldReserves().catch(() => 0n),
          token.isFullyBacked().catch(() => true),
          token.getActiveBarsCount().catch(() => 0n),
          token.getReserveRatio().catch(() => 0n),
        ]);
        const kycData = await api('/api/v1/kyc/' + account).catch(() => null);
        const sysData = await api('/api/v1/system/info').catch(() => null);
        if (mounted) {
          setData({
            balance: ethers.formatEther(bal),
            price: Number(price) / 1e8,
            supply: ethers.formatEther(supply),
            reserves: ethers.formatEther(reserves),
            backed, bars: Number(bars),
            ratio: Number(ratio),
            kyc: kycData,
            sys: sysData,
          });
        }
      } catch (e) { console.error(e); }
      if (mounted) setLoading(false);
    };
    fetch();
    const iv = setInterval(fetch, 15000);
    return () => { mounted = false; clearInterval(iv); };
  }, [token, account]);

  const g = data;
  const brlRate = systemInfo?.usdToBrl || 5.0;

  return (
    <div className="page">
      <div className="page-header">
        <h2>Overview</h2>
        <p className="page-sub">Real-time portfolio and system health</p>
      </div>

      <div className="stats-row">
        <div className="stat-card gold">
          <div className="stat-icon">💰</div>
          <div className="stat-body">
            <span className="stat-label">Your Balance</span>
            <span className="stat-value">{fmt(g.balance)} <small>GTK</small></span>
            <span className="stat-sub">{usd(g.balance * g.price)} | {brl(g.balance * g.price * brlRate)}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">🥇</div>
          <div className="stat-body">
            <span className="stat-label">Gold Price</span>
            <span className="stat-value">{usd(g.price)} <small>/ gram</small></span>
            <span className="stat-sub">Chainlink Oracle</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">🏛️</div>
          <div className="stat-body">
            <span className="stat-label">Reserves</span>
            <span className="stat-value" style={{ color: g.backed ? '#22c55e' : '#ef4444' }}>
              {g.backed ? '100% Backed' : '⚠️ Alert'}
            </span>
            <span className="stat-sub">{fmt(g.reserves)} g gold reserved</span>
          </div>
        </div>
        <div className="stat-card clickable" onClick={() => onNavigate('custody')}>
          <div className="stat-icon">📦</div>
          <div className="stat-body">
            <span className="stat-label">Gold Bars</span>
            <span className="stat-value">{g.bars} <small>bars</small></span>
            <span className="stat-sub">{fmt(g.supply)} GTK circulating</span>
          </div>
        </div>
      </div>

      <div className="panels-row">
        <div className="panel">
          <h3 className="panel-title">System Health</h3>
          <div className="health-list">
            <div className="health-item"><span className="h-dot green" />API Connected</div>
            <div className="health-item"><span className="h-dot green" />Blockchain Online</div>
            <div className="health-item">
              <span className={`h-dot ${g.backed ? 'green' : 'red'}`} />
              {g.backed ? 'Fully Backed' : 'Under-backed'}
            </div>
            <div className="health-item">
              <span className={`h-dot ${g.kyc?.isVerified ? 'green' : 'yellow'}`} />
              KYC: {g.kyc?.isVerified ? `Tier ${g.kyc.tier}` : 'Not Verified'}
            </div>
            <div className="health-item">
              <span className="h-dot green" />
              Reserve Ratio: {typeof g.ratio === 'number' && g.ratio > 0 ? (g.ratio / 100).toFixed(0) + '%' : 'N/A'}
            </div>
          </div>
        </div>

        <div className="panel">
          <h3 className="panel-title">Quick Actions</h3>
          <div className="quick-actions">
            <button className="btn-gold btn-block" onClick={() => onNavigate('deposit')}>
              💳 Deposit via PIX
            </button>
            <button className="btn-ghost btn-block" onClick={() => onNavigate('withdraw')}>
              💰 Withdraw to Bank
            </button>
            {!g.kyc?.isVerified && (
              <button className="btn-warning btn-block" onClick={() => onNavigate('admin')}>
                🔐 Complete KYC
              </button>
            )}
          </div>
        </div>
      </div>

      {g.sys && (
        <div className="panel">
          <h3 className="panel-title">System Metrics</h3>
          <div className="metrics-grid">
            <div className="metric"><span>Total Supply</span><strong>{fmt(g.sys.totalSupply)} GTK</strong></div>
            <div className="metric"><span>Gold Reserves</span><strong>{fmt(g.sys.totalGoldReserves)} g</strong></div>
            <div className="metric"><span>Gold Price</span><strong>{usd(g.sys.goldPricePerGram)}/g</strong></div>
            <div className="metric"><span>Reserve Ratio</span><strong>{g.sys.reserveRatio}</strong></div>
          </div>
        </div>
      )}
    </div>
  );
}
