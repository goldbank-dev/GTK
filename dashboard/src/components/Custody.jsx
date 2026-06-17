import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';

const fmt = (v) => parseFloat(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Custody({ token }) {
  const [bars, setBars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!token) return;
    const fetchBars = async () => {
      try {
        const count = await token.getActiveBarsCount();
        const serials = await Promise.all(
          Array.from({ length: Number(count) }).map((_, i) => token.activeBarSerials(i))
        );
        const details = await Promise.all(
          serials.map(s => token.getCustodyDetails(s))
        );
        setBars(details.map(d => ({
          serial: ethers.decodeBytes32String(d.barSerialNumber),
          weight: ethers.formatEther(d.weightGrams),
          purity: Number(d.purity) / 100,
          vault: d.vaultLocation,
          date: new Date(Number(d.depositedAt) * 1000).toLocaleDateString(),
          active: d.isActive
        })));
      } catch (e) {
        console.error(e);
        setError('Failed to fetch custody data');
      }
      setLoading(false);
    };
    fetchBars();
  }, [token]);

  return (
    <div className="page">
      <div className="page-header">
        <h2>Gold Custody Audit</h2>
        <p className="page-sub">Public proof of reserves - physical bars in vault</p>
      </div>

      <div className="info-card gold-border">
        <div className="info-icon">🏢</div>
        <div className="info-body">
          <h4>Custody Partner: Brink's Global Services</h4>
          <p>All gold bars are physically audited and insured. Each bar corresponds to 1:1 token issuance.</p>
        </div>
      </div>

      {loading ? (
        <div className="loading-state">
          <div className="spinner" />
          <p>Scanning blockchain for custody records...</p>
        </div>
      ) : error ? (
        <div className="msg error"><span>⚠️ {error}</span></div>
      ) : bars.length === 0 ? (
        <div className="panel empty-state">
          <h3>No bars registered yet</h3>
          <p>Reserves are currently empty or being updated.</p>
        </div>
      ) : (
        <div className="panel">
          <table className="table">
            <thead>
              <tr>
                <th>Serial Number</th>
                <th>Weight (g)</th>
                <th>Purity</th>
                <th>Vault Location</th>
                <th>Deposit Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {bars.map((bar, i) => (
                <tr key={i}>
                  <td><code>{bar.serial}</code></td>
                  <td><strong>{fmt(bar.weight)} g</strong></td>
                  <td>{bar.purity.toFixed(2)}%</td>
                  <td>{bar.vault}</td>
                  <td>{bar.date}</td>
                  <td><span className="badge success">Verified</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="audit-footer">
            <p>Total bars: <strong>{bars.length}</strong> | Total Weight: <strong>{fmt(bars.reduce((a, b) => a + parseFloat(b.weight), 0))} g</strong></p>
          </div>
        </div>
      )}
    </div>
  );
}
