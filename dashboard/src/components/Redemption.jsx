import React, { useState } from 'react';
import { ethers } from 'ethers';

export default function Redemption({ account, token, signer }) {
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleRedeem = async () => {
    if (!amount || amount < 100) { setError('Minimum 100g for physical redemption'); return; }
    const delivery = prompt('Delivery address (street, city, country):');
    if (!delivery) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const s = await signer;
      const t = new ethers.Contract(token.target, token.interface.fragments, s);
      const tx = await t.requestRedemption(ethers.parseEther(amount.toString()), delivery);
      await tx.wait();
      setResult({ txHash: tx.hash, amount, delivery });
      setAmount('');
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2>Physical Gold Redemption</h2>
        <p className="page-sub">Redeem GTK for physical 99.99% gold bars</p>
      </div>

      <div className="info-card">
        <div className="info-icon">📋</div>
        <div className="info-body">
          <h4>Redemption Rules</h4>
          <ul>
            <li>Minimum: <strong>100g</strong> GTK</li>
            <li>Fee: <strong>0.5%</strong></li>
            <li>Purity: <strong>99.99% (24K)</strong></li>
            <li>Delivery: insured & tracked</li>
            <li>Vault: Brink's Zurich / Sao Paulo</li>
          </ul>
        </div>
      </div>

      <div className="form-card">
        <div className="form-group">
          <label className="form-label">Amount to Redeem (grams)</label>
          <div className="input-wrap">
            <input type="number" className="input-lg" value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder="100" min="100" />
            <span className="input-suffix">GTK</span>
          </div>
          <span className="form-hint">Minimum: 100 GTK • Fee: 0.5%</span>
        </div>

        {amount >= 100 && (
          <div className="preview">
            <div className="preview-row"><span>You redeem</span><strong>{amount}g of 99.99% Gold</strong></div>
            <div className="preview-divider" />
            <div className="preview-row highlight"><span>Delivery</span><strong>Insured shipping</strong></div>
          </div>
        )}

        <button className="btn-gold btn-block btn-lg btn-gold-special" onClick={handleRedeem}
          disabled={loading || !amount || amount < 100}>
          {loading ? <><span className="spinner" /> Processing...</> : '🏆 Request Physical Gold'}
        </button>
      </div>

      {error && <div className="msg error"><span>⚠️ {error}</span></div>}

      {result && (
        <div className="result-card">
          <div className="result-header success">✅ Redemption Requested</div>
          <div className="result-body">
            <div className="result-row"><span>TX Hash</span><code>{result.txHash}</code></div>
            <div className="result-row"><span>Amount</span><strong>{result.amount}g Gold</strong></div>
            <div className="result-row"><span>Delivery</span>{result.delivery}</div>
            <button className="btn-ghost btn-sm" onClick={() => setResult(null)}>Clear</button>
          </div>
        </div>
      )}
    </div>
  );
}
