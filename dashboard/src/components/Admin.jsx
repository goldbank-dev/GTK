import React, { useState } from 'react';
import { ethers } from 'ethers';

const fmt = (v) => { const n = parseFloat(v); if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M'; if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K'; return n.toFixed(4); };

export default function Admin({ api, token, chainId }) {
  const [addr, setAddr] = useState('');
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sys, setSys] = useState(null);
  const [kycForm, setKycForm] = useState(false);
  const [kycLoading, setKycLoading] = useState(false);

  React.useEffect(() => {
    api('/api/v1/system/info').then(setSys).catch(() => {});
  }, []);

  const lookup = async () => {
    if (!ethers.isAddress(addr)) { setError('Invalid address'); return; }
    setLoading(true); setError(null);
    try {
      const [bal, kyc] = await Promise.all([
        api('/api/v1/balance/' + addr),
        api('/api/v1/kyc/' + addr),
      ]);
      setInfo({ bal, kyc });
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handleKYC = async (e) => {
    e.preventDefault();
    setKycLoading(true); setError(null);
    try {
      await api('/api/v1/kyc/register', {
        method: 'POST',
        body: JSON.stringify({
          name: e.target.name.value,
          email: e.target.email.value,
          document: e.target.document.value,
          phone: e.target.phone.value,
          walletAddress: addr || e.target.wallet.value,
        }),
      });
      setKycForm(false);
    } catch (e) { setError(e.message); }
    setKycLoading(false);
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2>Admin Panel</h2>
        <p className="page-sub">System management and monitoring</p>
      </div>

      {sys && (
        <div className="panel">
          <h3 className="panel-title">System Overview</h3>
          <div className="metrics-grid">
            <div className="metric"><span>Network</span><strong>{chainId === 11155111 ? 'Sepolia' : chainId === 1 ? 'Mainnet' : 'Chain ' + chainId}</strong></div>
            <div className="metric"><span>Total Supply</span><strong>{fmt(sys.totalSupply)} GTK</strong></div>
            <div className="metric"><span>Gold Reserves</span><strong>{fmt(sys.totalGoldReserves)} g</strong></div>
            <div className="metric"><span>Gold Price</span><strong>${sys.goldPricePerGram}/g</strong></div>
            <div className="metric"><span>Reserve Ratio</span><strong>{sys.reserveRatio}</strong></div>
            <div className="metric"><span>Status</span><strong style={{ color: sys.isFullyBacked ? '#22c55e' : '#ef4444' }}>{sys.isFullyBacked ? '✅ Backed' : '❌ Alert'}</strong></div>
          </div>
        </div>
      )}

      <div className="panels-row">
        <div className="panel">
          <h3 className="panel-title">Address Lookup</h3>
          <div className="lookup-row">
            <input type="text" className="input" value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="0x..." style={{ flex: 1 }} />
            <button className="btn-gold" onClick={lookup} disabled={loading}>{loading ? '...' : 'Search'}</button>
          </div>
          {info && (
            <div className="lookup-result">
              <div className="lookup-item"><span>GTK Balance</span><strong>{fmt(info.bal.gtkBalance)} GTK</strong></div>
              <div className="lookup-item"><span>USD Value</span><strong>${parseFloat(info.bal.estimatedUSDValue).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong></div>
              <div className="lookup-item"><span>USDT</span><strong>${parseFloat(info.bal.usdtBalance).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong></div>
              <div className="lookup-item"><span>KYC Tier</span><strong>{info.kyc.tier} ({info.kyc.isVerified ? '✅' : '❌'})</strong></div>
              <div className="lookup-item"><span>Blacklisted</span><strong>{info.kyc.isBlacklisted ? '🚫 Yes' : '✅ No'}</strong></div>
            </div>
          )}
        </div>

        <div className="panel">
          <h3 className="panel-title">KYC Registration</h3>
          {!kycForm ? (
            <button className="btn-gold btn-block" onClick={() => setKycForm(true)}>🔐 Register New KYC</button>
          ) : (
            <form onSubmit={handleKYC} className="kyc-form">
              <input name="name" className="input" placeholder="Full Name" required />
              <input name="email" type="email" className="input" placeholder="Email" required />
              <input name="document" className="input" placeholder="CPF (numbers only)" required />
              <input name="phone" className="input" placeholder="Phone with DDD" />
              <input name="wallet" className="input" placeholder="Wallet Address" defaultValue={addr} />
              <div className="kyc-actions">
                <button type="submit" className="btn-gold btn-block" disabled={kycLoading}>
                  {kycLoading ? 'Processing...' : 'Submit KYC'}
                </button>
                <button type="button" className="btn-ghost btn-block" onClick={() => setKycForm(false)}>Cancel</button>
              </div>
            </form>
          )}
        </div>
      </div>

      {error && <div className="msg error"><span>⚠️ {error}</span></div>}
    </div>
  );
}
