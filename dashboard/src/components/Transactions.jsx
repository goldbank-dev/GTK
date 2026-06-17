import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';

const fmt = (v) => parseFloat(v).toLocaleString('en-US', { minimumFractionDigits: 4 });

export default function Transactions({ account, token, provider }) {
  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token || !account || !provider) return;
    const fetchTxs = async () => {
      try {
        const currentBlock = await provider.getBlockNumber();
        const fromBlock = currentBlock - 10000 > 0 ? currentBlock - 10000 : 0;

        const [mintFilter, burnFilter, redempFilter] = [
          token.filters.TokensMinted(account),
          token.filters.TokensBurned(account),
          token.filters.RedemptionRequested(null, account),
        ];

        const [mints, burns, redemps] = await Promise.all([
          token.queryFilter(mintFilter, fromBlock),
          token.queryFilter(burnFilter, fromBlock),
          token.queryFilter(redempFilter, fromBlock),
        ]);

        const all = [
          ...mints.map(e => ({ type: 'Mint', amount: ethers.formatEther(e.args[1]), hash: e.transactionHash, block: e.blockNumber, date: 'Recent' })),
          ...burns.map(e => ({ type: 'Burn', amount: ethers.formatEther(e.args[1]), hash: e.transactionHash, block: e.blockNumber, date: 'Recent' })),
          ...redemps.map(e => ({ type: 'Redeem', amount: ethers.formatEther(e.args[2]), hash: e.transactionHash, block: e.blockNumber, date: 'Recent' })),
        ].sort((a, b) => b.block - a.block);

        setTxs(all);
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    fetchTxs();
  }, [token, account, provider]);

  return (
    <div className="page">
      <div className="page-header">
        <h2>Transaction History</h2>
        <p className="page-sub">Latest blockchain operations for your wallet</p>
      </div>

      {loading ? (
        <div className="loading-state"><div className="spinner" /><p>Fetching events...</p></div>
      ) : txs.length === 0 ? (
        <div className="panel empty-state">
          <h3>No recent activity</h3>
          <p>Transactions from the last 10,000 blocks will appear here.</p>
        </div>
      ) : (
        <div className="panel">
          <table className="table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Transaction Hash</th>
              </tr>
            </thead>
            <tbody>
              {txs.map((tx, i) => (
                <tr key={i}>
                  <td>
                    <span className={`badge ${tx.type === 'Mint' ? 'success' : tx.type === 'Burn' ? 'warning' : 'info'}`}>
                      {tx.type}
                    </span>
                  </td>
                  <td><strong>{fmt(tx.amount)} GTK</strong></td>
                  <td><span className="badge success">Confirmed</span></td>
                  <td><code>{tx.hash}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
