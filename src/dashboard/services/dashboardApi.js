const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3000';
const API_KEY = process.env.REACT_APP_API_KEY || '';

async function api(endpoint, opts = {}) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, ...opts.headers },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export const getSystemInfo = () => api('/api/v1/system/info');
export const getBalance = (addr) => api(`/api/v1/balance/${addr}`);
export const getKYC = (addr) => api(`/api/v1/kyc/${addr}`);
export const registerKYC = (data) => api('/api/v1/kyc/register', { method: 'POST', body: JSON.stringify(data) });
export const createPixDeposit = (userAddress, amountBRL) =>
  api('/api/v1/deposit/pix/create', { method: 'POST', body: JSON.stringify({ userAddress, amountBRL }) });
export const getDepositStatus = (pixId) => api(`/api/v1/deposit/pix/${pixId}/status`);
export const requestWithdrawal = (userAddress, gtkAmount, pixKey) =>
  api('/api/v1/withdrawal/pix', { method: 'POST', body: JSON.stringify({ userAddress, gtkAmount, pixKey }) });
export const healthCheck = () => api('/health');

export const formatGTK = (v) => {
  const n = parseFloat(v);
  if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(2) + 'K';
  return n.toFixed(4);
};

export const formatUSD = (v) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(parseFloat(v));
};

export const formatBRL = (v) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parseFloat(v));
};

export const formatAddress = (addr) => {
  if (!addr) return '';
  return addr.slice(0, 6) + '...' + addr.slice(-4);
};

export const formatDate = (ts) => {
  return new Date(ts).toLocaleString('pt-BR');
};
