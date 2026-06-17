import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';

const usd = (v) => '$' + parseFloat(v).toLocaleString('en-US', { minimumFractionDigits: 2 });
const brl = (v) => 'R$ ' + parseFloat(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

export default function Withdraw({ account, token, api, signer, systemInfo }) {
  const [amount, setAmount] = useState('');
  const [pixKey, setPixKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [balance, setBalance] = useState('0');
  const [price, setPrice] = useState(0);

  const brlRate = systemInfo?.usdToBrl || 5.0;

  useEffect(() => {
    if (!token) return;
    token.balanceOf(account).then((b) => {
      setBalance(ethers.formatEther(b));
    }).catch(() => {});
    token.goldPricePerGram().then((p) => setPrice(Number(p) / 1e8)).catch(() => {});
  }, [token, account]);

  const handleWithdraw = async () => {
    if (!amount || !pixKey) { setError('Fill all fields'); return; }
    if (parseFloat(amount) > parseFloat(balance)) { setError('Insufficient balance'); return; }
    setLoading(true); setError(null); setResult(null);
    try {
      const r = await api('/api/v1/withdrawal/pix', {
        method: 'POST',
        body: JSON.stringify({ userAddress: account, gtkAmount: parseFloat(amount), pixKey }),
      });
      setResult(r);
      setAmount(''); setPixKey('');
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2>Withdraw to Bank</h2>
        <p className="page-sub">Convert GTK to BRL via PIX</p>
      </div>

      <div className="form-card">
        <div className="form-group">
          <label className="form-label">Amount in GTK</label>
          <div className="input-wrap">
            <input type="number" className="input-lg" value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder="10" min="0.01" step="0.01" />
            <span className="input-suffix">GTK</span>
          </div>
          <span className="form-hint">Balance: {parseFloat(balance).toFixed(4)} GTK • Fee: 0.75%</span>
        </div>

        <div className="form-group">
          <label className="form-label">PIX Key</label>
          <input type="text" className="input" value={pixKey} onChange={(e) => setPixKey(e.target.value)}
            placeholder="CPF, email, phone, or random key" />
        </div>

        {amount > 0 && price > 0 && (
          <div className="preview">
            <div className="preview-row"><span>You sell</span><strong>{parseFloat(amount).toFixed(4)} GTK</strong></div>
            <div className="preview-row"><span>Gold value</span><strong>{usd(amount * price)}</strong></div>
            <div className="preview-row"><span>Fee (0.75%)</span><strong>{usd(amount * price * 0.0075)}</strong></div>
            <div className="preview-divider" />
            <div className="preview-row highlight">
              <span>You receive ≈</span>
              <strong className="green-text">{brl(amount * price * brlRate * 0.9925)}</strong>
            </div>
          </div>
        )}

        <button className="btn-gold btn-block btn-lg" onClick={handleWithdraw}
          disabled={loading || !amount || !pixKey}>
          {loading ? <><span className="spinner" /> Processing...</> : '💸 Withdraw to PIX'}
        </button>
      </div>

      {error && <div className="msg error"><span>⚠️ {error}</span></div>}

      {result && (
        <div className="result-card">
          <div className="result-header success">✅ Withdrawal Requested</div>
          <div className="result-body">
            <div className="result-row"><span>TX Hash</span><code>{result.blockchainTxHash}</code></div>
            <div className="result-row"><span>Amount</span><strong>{result.gtkAmount} GTK</strong></div>
            <div className="result-row"><span>PIX Key</span>{result.pixKey}</div>
            <div className="result-row"><span>Arrival</span>{result.estimatedArrival}</div>
            <button className="btn-ghost btn-sm" onClick={() => setResult(null)}>Clear</button>
          </div>
        </div>
      )}
    </div>
  );
}
