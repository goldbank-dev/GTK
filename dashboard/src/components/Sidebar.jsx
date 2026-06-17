import React from 'react';

const items = [
  { id: 'overview', icon: '📊', label: 'Overview' },
  { id: 'deposit', icon: '💳', label: 'Deposit' },
  { id: 'withdraw', icon: '💰', label: 'Withdraw' },
  { id: 'redemption', icon: '🏆', label: 'Gold' },
  { id: 'custody', icon: '🏢', label: 'Custody' },
  { id: 'history', icon: '📜', label: 'History' },
  { id: 'admin', icon: '⚙️', label: 'Admin' },
];

export default function Sidebar({ active, onChange }) {
  return (
    <nav className="sidebar">
      <div className="sidebar-items">
        {items.map((item) => (
          <button
            key={item.id}
            className={`sidebar-item ${active === item.id ? 'active' : ''}`}
            onClick={() => onChange(item.id)}
          >
            <span className="sidebar-icon">{item.icon}</span>
            <span className="sidebar-label">{item.label}</span>
          </button>
        ))}
      </div>
      <div className="sidebar-footer">
        <div className="sidebar-version">v2.0.0</div>
      </div>
    </nav>
  );
}
