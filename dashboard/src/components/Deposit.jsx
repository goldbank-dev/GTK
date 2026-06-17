import React, { useState } from 'react';

const brl = (v) => 'R$ ' + parseFloat(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

export default function Deposit({ account, token, api, systemInfo }) {
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    if (!amount || amount < 50) { setError('Minimum: R$ 50'); return; }
    setLoading(true); setError(null); setResult(null);
    try {
      const r = await api('/api/v1/deposit/pix/create', {
        method: 'POST',
        body: JSON.stringify({ userAddress: account, amountBRL: parseFloat(amount) }),
      });
      setResult(r);
      setAmount('');
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const rate = systemInfo?.usdToBrl || 5.0;

  return (
    <div className="page">
      <div className="page-header">
        <h2>Deposit via PIX</h2>
        <p className="page-sub">Convert BRL to GTK instantly</p>
      </div>

      <div className="form-card">
        <div className="form-group">
          <label className="form-label">Amount in BRL</label>
          <div className="input-wrap">
            <span className="input-prefix">R$</span>
            <input type="number" className="input-lg" value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder="100.00" min="50" step="0.01" />
          </div>
          <span className="form-hint">Minimum: R$ 50.00 • Fee: 0.5%</span>
        </div>

        {amount > 0 && (
          <div className="preview">
            <div className="preview-row"><span>You send</span><strong>{brl(amount)}</strong></div>
            <div className="preview-row"><span>Exchange rate</span><strong>R$ {rate} = $1.00</strong></div>
            <div className="preview-divider" />
            <div className="preview-row highlight"><span>You receive ≈</span>
              <strong className="gold-text">{(amount / rate * 0.995).toFixed(4)} GTK</strong>
            </div>
          </div>
        )}

        <button className="btn-gold btn-block btn-lg" onClick={handleSubmit} disabled={loading || !amount || amount < 50}>
          {loading ? <><span className="spinner" /> Processing...</> : '🔗 Generate PIX'}
        </button>
      </div>

      {error && <div className="msg error"><span>⚠️ {error}</span></div>}

      {result && (
        <div className="result-card">
          <div className="result-header success">✅ PIX Generated</div>
          <div className="result-body">
            <div className="result-row"><span>ID</span><code>{result.pixId}</code></div>
            <div className="result-row"><span>Value</span><strong>{brl(result.amountBRL)} → {result.estimatedGTK} GTK</strong></div>
            <div className="result-row"><span>Gold Price</span><strong>${result.goldPricePerGram}/g</strong></div>
            <div className="result-row"><span>Expires</span>{new Date(result.expiresAt).toLocaleString('pt-BR')}</div>
            <div className="result-pix">
              <span>PIX Copia e Cola</span>
              <textarea readOnly rows={3} value={result.pixCopyPaste} />
            </div>
            <button className="btn-ghost btn-sm" onClick={() => setResult(null)}>Clear</button>
          </div>
        </div>
      )}
    </div>
  );
}
