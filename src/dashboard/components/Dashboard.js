import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import * as api from '../services/dashboardApi';

// ABIs
const GTK_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function goldPricePerGram() view returns (uint256)',
  'function totalGoldReserves() view returns (uint256)',
  'function isFullyBacked() view returns (bool)',
  'function getReserveRatio() view returns (uint256)',
  'function getTokenValueInUSD(uint256) view returns (uint256)',
  'function blacklisted(address) view returns (bool)',
  'function kycTier(address) view returns (uint8)',
  'function getActiveBarsCount() view returns (uint256)',
  'function custodyRecords(bytes32) view returns (bytes32,uint256,uint256,string,uint256,bool)',
  'function requestRedemption(uint256,string) returns (uint256)',
];

const formatDuration = (ms) => {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
};

const TOKEN_ADDR = process.env.REACT_APP_GTK_TOKEN_ADDRESS;

export default function Dashboard() {
  // Wallet
  const [account, setAccount] = useState(null);
  const [provider, setProvider] = useState(null);
  const [chainId, setChainId] = useState(0);

  // Data
  const [systemInfo, setSystemInfo] = useState(null);
  const [balance, setBalance] = useState('0');
  const [goldPrice, setGoldPrice] = useState(0);
  const [kycInfo, setKycInfo] = useState(null);
  const [activeBars, setActiveBars] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [uptime, setUptime] = useState(0);

  // Tabs
  const [tab, setTab] = useState('overview');

  // Forms
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [pixKey, setPixKey] = useState('');
  const [txHistory, setTxHistory] = useState([]);
  const [pixResult, setPixResult] = useState(null);
  const [withdrawResult, setWithdrawResult] = useState(null);

  // Admin
  const [adminAddress, setAdminAddress] = useState('');
  const [adminBalance, setAdminBalance] = useState(null);
  const [adminKYC, setAdminKYC] = useState(null);
  const [showKYCForm, setShowKYCForm] = useState(false);

  // Uptime counter
  useEffect(() => {
    const start = Date.now();
    const iv = setInterval(() => setUptime(Date.now() - start), 1000);
    return () => clearInterval(iv);
  }, []);

  // Connect wallet
  const connectWallet = useCallback(async () => {
    if (!window.ethereum) {
      setError('MetaMask not detected');
      return;
    }
    try {
      const prov = new ethers.BrowserProvider(window.ethereum);
      const accounts = await prov.send('eth_requestAccounts', []);
      const network = await prov.getNetwork();
      setProvider(prov);
      setAccount(accounts[0]);
      setChainId(Number(network.chainId));
      setError(null);
    } catch (e) {
      setError('Connection failed: ' + e.message);
    }
  }, []);

  const disconnectWallet = useCallback(() => {
    setAccount(null);
    setProvider(null);
    setBalance('0');
  }, []);

  // Fetch on-chain data
  useEffect(() => {
    if (!provider || !account) return;

    const token = new ethers.Contract(TOKEN_ADDR, GTK_ABI, provider);

    const fetchData = async () => {
      try {
        const [bal, price, bars] = await Promise.all([
          token.balanceOf(account),
          token.goldPricePerGram(),
          token.getActiveBarsCount(),
        ]);
        setBalance(ethers.formatEther(bal));
        setGoldPrice(Number(price) / 10 ** 8);
        setActiveBars(Number(bars));

        // API data
        const [sysInfo, kyc] = await Promise.all([
          api.getSystemInfo().catch(() => null),
          api.getKYC(account).catch(() => null),
        ]);
        if (sysInfo) setSystemInfo(sysInfo);
        if (kyc) setKycInfo(kyc);
      } catch (e) {
        console.error('Fetch error:', e);
      }
    };

    fetchData();
    const iv = setInterval(fetchData, 15000);
    return () => clearInterval(iv);
  }, [provider, account]);

  // Deposit PIX
  const handleDeposit = async () => {
    if (!depositAmount || depositAmount < 50) {
      setError('Minimum deposit: R$ 50');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await api.createPixDeposit(account, parseFloat(depositAmount));
      setPixResult(result);
      setDepositAmount('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Withdrawal
  const handleWithdraw = async () => {
    if (!withdrawAmount || !pixKey) {
      setError('Fill all fields');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await api.requestWithdrawal(account, parseFloat(withdrawAmount), pixKey);
      setWithdrawResult(result);
      setWithdrawAmount('');
      setPixKey('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Physical redemption
  const handleRedemption = async () => {
    if (!withdrawAmount || withdrawAmount < 100) {
      setError('Minimum 100g for physical redemption');
      return;
    }
    const delivery = prompt('Delivery address:');
    if (!delivery) return;

    setLoading(true);
    setError(null);
    try {
      const signer = await provider.getSigner();
      const token = new ethers.Contract(TOKEN_ADDR, GTK_ABI, signer);
      const tx = await token.requestRedemption(
        ethers.parseEther(withdrawAmount.toString()),
        delivery
      );
      await tx.wait();
      setWithdrawResult({ type: 'redemption', txHash: tx.hash, amount: withdrawAmount });
      setWithdrawAmount('');
    } catch (e) {
      setError('Redemption failed: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // Admin lookup
  const handleAdminLookup = async () => {
    if (!ethers.isAddress(adminAddress)) {
      setError('Invalid address');
      return;
    }
    try {
      const [bal, kyc] = await Promise.all([
        api.getBalance(adminAddress),
        api.getKYC(adminAddress),
      ]);
      setAdminBalance(bal);
      setAdminKYC(kyc);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  };

  // KYC Register
  const handleKYCRegister = async (e) => {
    e.preventDefault();
    const form = e.target;
    setLoading(true);
    setError(null);
    try {
      await api.registerKYC({
        name: form.name.value,
        email: form.email.value,
        document: form.document.value,
        phone: form.phone.value,
        walletAddress: account,
      });
      setShowKYCForm(false);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Styles
  const styles = dashboardStyles;

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.logo}>
          <span style={styles.logoIcon}>🥇</span>
          <div>
            <h1 style={styles.title}>GTK Dashboard</h1>
            <span style={styles.subtitle}>Gold Token Operations</span>
          </div>
        </div>
        <div style={styles.headerRight}>
          <span style={styles.badge}>{chainId === 11155111 ? 'Sepolia' : chainId === 1 ? 'Mainnet' : 'Unknown'}</span>
          {account ? (
            <div style={styles.walletInfo}>
              <span style={styles.dot}></span>
              <span style={styles.address}>{account.slice(0, 6)}...{account.slice(-4)}</span>
              <button onClick={disconnectWallet} style={styles.btnSmall}>Exit</button>
            </div>
          ) : (
            <button onClick={connectWallet} style={styles.btnConnect}>Connect Wallet</button>
          )}
        </div>
      </header>

      {/* Error */}
      {error && <div style={styles.error}>{error}<button onClick={() => setError(null)} style={styles.errorClose}>×</button></div>}

      {/* Main */}
      <div style={styles.layout}>
        {/* Sidebar */}
        <nav style={styles.sidebar}>
          {[
            { id: 'overview', icon: '📊', label: 'Overview' },
            { id: 'deposit', icon: '💳', label: 'Deposit PIX' },
            { id: 'withdraw', icon: '💰', label: 'Withdraw' },
            { id: 'redemption', icon: '🏆', label: 'Gold Redemption' },
            { id: 'admin', icon: '⚙️', label: 'Admin' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              style={{
                ...styles.navItem,
                ...(tab === item.id ? styles.navItemActive : {}),
              }}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Content */}
        <main style={styles.content}>
          {tab === 'overview' && renderOverview()}
          {tab === 'deposit' && renderDeposit()}
          {tab === 'withdraw' && renderWithdraw()}
          {tab === 'redemption' && renderRedemption()}
          {tab === 'admin' && renderAdmin()}
        </main>
      </div>
    </div>
  );

  function renderOverview() {
    return (
      <>
        <h2 style={styles.sectionTitle}>System Overview</h2>
        <div style={styles.statsGrid}>
          <div style={styles.statCard}>
            <div style={styles.statIcon}>💰</div>
            <div style={styles.statLabel}>Your GTK Balance</div>
            <div style={styles.statValue}>{api.formatGTK(balance)} <span style={styles.statUnit}>GTK</span></div>
            <div style={styles.statSub}>≈ {api.formatUSD(balance * goldPrice)} USD</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statIcon}>🥇</div>
            <div style={styles.statLabel}>Gold Price</div>
            <div style={styles.statValue}>{api.formatUSD(goldPrice)} <span style={styles.statUnit}>/g</span></div>
            <div style={styles.statSub}>Live Chainlink Oracle</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statIcon}>🏛️</div>
            <div style={styles.statLabel}>Reserve Status</div>
            <div style={{
              ...styles.statValue,
              color: systemInfo?.isFullyBacked ? '#22c55e' : '#ef4444',
            }}>
              {systemInfo?.isFullyBacked ? '100% Backed' : '⚠️ Alert'}
            </div>
            <div style={styles.statSub}>
              {systemInfo ? `${api.formatGTK(systemInfo.totalGoldReserves)}g gold reserved` : 'Loading...'}
            </div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statIcon}>📦</div>
            <div style={styles.statLabel}>Gold Bars in Custody</div>
            <div style={styles.statValue}>{activeBars} <span style={styles.statUnit}>bars</span></div>
            <div style={styles.statSub}>
              {systemInfo ? `${api.formatGTK(systemInfo.totalSupply)} GTK circulating` : ''}
            </div>
          </div>
        </div>

        <div style={styles.healthRow}>
          <div style={styles.healthCard}>
            <h3 style={styles.cardTitle}>System Health</h3>
            <div style={styles.healthList}>
              <div style={styles.healthItem}>
                <span style={{ ...styles.healthDot, background: '#22c55e' }}></span>
                API: Online (uptime: {formatDuration(uptime)})
              </div>
              <div style={styles.healthItem}>
                <span style={{ ...styles.healthDot, background: chainId ? '#22c55e' : '#ef4444' }}></span>
                Blockchain: {chainId ? `Connected (chain ${chainId})` : 'Disconnected'}
              </div>
              <div style={styles.healthItem}>
                <span style={{ ...styles.healthDot, background: systemInfo?.isFullyBacked ? '#22c55e' : '#ef4444' }}></span>
                Reserves: {systemInfo?.isFullyBacked ? 'Fully Backed' : 'Check Required'}
              </div>
              <div style={styles.healthItem}>
                <span style={{ ...styles.healthDot, background: kycInfo?.isVerified ? '#22c55e' : '#f59e0b' }}></span>
                KYC: {kycInfo?.isVerified ? 'Verified (Tier ' + kycInfo.tier + ')' : 'Not Verified'}
              </div>
            </div>
          </div>
          <div style={styles.healthCard}>
            <h3 style={styles.cardTitle}>Quick Actions</h3>
            <div style={styles.quickActions}>
              <button onClick={() => setTab('deposit')} style={styles.btnPrimary}>
                💳 Deposit via PIX
              </button>
              <button onClick={() => setTab('withdraw')} style={styles.btnSecondary}>
                💰 Withdraw to Bank
              </button>
              {!kycInfo?.isVerified && (
                <button onClick={() => setShowKYCForm(!showKYCForm)} style={styles.btnWarning}>
                  🔐 Complete KYC
                </button>
              )}
            </div>
          </div>
        </div>

        {/* KYC Registration Form */}
        {showKYCForm && (
          <div style={styles.kycForm}>
            <h3>KYC Registration</h3>
            <form onSubmit={handleKYCRegister} style={styles.form}>
              <input name="name" placeholder="Full Name" required style={styles.input} />
              <input name="email" type="email" placeholder="Email" required style={styles.input} />
              <input name="document" placeholder="CPF (numbers only)" required style={styles.input} />
              <input name="phone" placeholder="Phone (with DDD)" style={styles.input} />
              <button type="submit" disabled={loading} style={styles.btnPrimary}>
                {loading ? 'Processing...' : 'Submit KYC'}
              </button>
            </form>
          </div>
        )}

        {/* PIX Result Display */}
        {pixResult && (
          <div style={styles.resultCard}>
            <h3>✅ PIX Created</h3>
            <p>ID: {pixResult.pixId}</p>
            <p>Value: {api.formatBRL(pixResult.amountBRL)}</p>
            <p>Estimated GTK: {pixResult.estimatedGTK} GTK</p>
            <p>Gold Price: {api.formatUSD(pixResult.goldPricePerGram)}/g</p>
            <p>Expires: {new Date(pixResult.expiresAt).toLocaleTimeString('pt-BR')}</p>
            <div style={styles.pixCode}>
              <strong>PIX Copia e Cola:</strong>
              <code style={styles.code}>{pixResult.pixCopyPaste}</code>
            </div>
            <button onClick={() => setPixResult(null)} style={styles.btnSmall}>Dismiss</button>
          </div>
        )}
      </>
    );
  }

  function renderDeposit() {
    return (
      <>
        <h2 style={styles.sectionTitle}>💳 Deposit via PIX</h2>
        <p style={styles.sectionSub}>Convert BRL to GTK instantly via PIX</p>

        <div style={styles.formCard}>
          <label style={styles.label}>Amount in BRL</label>
          <div style={styles.inputGroup}>
            <span style={styles.inputPrefix}>R$</span>
            <input
              type="number"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              placeholder="100.00"
              min="50"
              step="0.01"
              style={styles.inputLarge}
            />
          </div>
          <p style={styles.hint}>Minimum: R$ 50.00 | Fee: 0.5%</p>

          {depositAmount > 0 && (
            <div style={styles.preview}>
              <div style={styles.previewRow}>
                <span>You send</span>
                <strong>{api.formatBRL(depositAmount)}</strong>
              </div>
              <div style={styles.previewRow}>
                <span>Exchange rate</span>
                <strong>R$ 5.00 = $1.00</strong>
              </div>
              <div style={styles.previewRow}>
                <span>Gold price</span>
                <strong>{api.formatUSD(goldPrice)}/g</strong>
              </div>
              <div style={styles.previewDivider} />
              <div style={styles.previewRow}>
                <span>You receive ≈</span>
                <strong style={{ color: '#ffd700', fontSize: 20 }}>
                  {((depositAmount * 0.20 * 10 ** 20) / (goldPrice * 10 ** 8) / 10 ** 18 * 0.995).toFixed(4)} GTK
                </strong>
              </div>
            </div>
          )}

          <button
            onClick={handleDeposit}
            disabled={loading || !depositAmount || depositAmount < 50}
            style={styles.btnPrimaryFull}
          >
            {loading ? '⏳ Processing...' : '🔗 Generate PIX'}
          </button>

          {pixResult && (
            <div style={styles.resultCard}>
              <h4>✅ PIX Generated!</h4>
              <p>ID: {pixResult.pixId}</p>
              <p>Value: {api.formatBRL(pixResult.amountBRL)} → ~{pixResult.estimatedGTK} GTK</p>
              <p>Gold Price: {api.formatUSD(pixResult.goldPricePerGram)}/g</p>
              <div style={styles.pixCode}>
                <strong>PIX Copia e Cola:</strong>
                <textarea readOnly value={pixResult.pixCopyPaste} style={styles.codeArea} rows={3} />
              </div>
              <p style={styles.hint}>Expires: {new Date(pixResult.expiresAt).toLocaleString('pt-BR')}</p>
              <button onClick={() => setPixResult(null)} style={styles.btnSmall}>Clear</button>
            </div>
          )}
        </div>
      </>
    );
  }

  function renderWithdraw() {
    return (
      <>
        <h2 style={styles.sectionTitle}>💰 Withdraw to Bank Account</h2>
        <p style={styles.sectionSub}>Convert GTK to BRL via PIX</p>

        <div style={styles.formCard}>
          <label style={styles.label}>Amount in GTK (grams)</label>
          <div style={styles.inputGroup}>
            <input
              type="number"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              placeholder="10"
              min="1"
              step="0.01"
              style={styles.inputLarge}
            />
            <span style={styles.inputSuffix}>GTK</span>
          </div>
          <p style={styles.hint}>Balance: {api.formatGTK(balance)} GTK | Fee: 0.75%</p>

          <label style={styles.label}>PIX Key</label>
          <input
            type="text"
            value={pixKey}
            onChange={(e) => setPixKey(e.target.value)}
            placeholder="CPF, email, phone, or random key"
            style={styles.input}
          />

          {withdrawAmount > 0 && (
            <div style={styles.preview}>
              <div style={styles.previewRow}>
                <span>You sell</span>
                <strong>{withdrawAmount} GTK</strong>
              </div>
              <div style={styles.previewRow}>
                <span>Gold value</span>
                <strong>{api.formatUSD(withdrawAmount * goldPrice)}</strong>
              </div>
              <div style={styles.previewRow}>
                <span>Fee (0.75%)</span>
                <strong>{api.formatUSD(withdrawAmount * goldPrice * 0.0075)}</strong>
              </div>
              <div style={styles.previewDivider} />
              <div style={styles.previewRow}>
                <span>You receive ≈</span>
                <strong style={{ color: '#22c55e', fontSize: 20 }}>
                  {api.formatBRL(withdrawAmount * goldPrice / 0.20 * 0.9925)}
                </strong>
              </div>
            </div>
          )}

          <button
            onClick={handleWithdraw}
            disabled={loading || !withdrawAmount || !pixKey}
            style={styles.btnPrimaryFull}
          >
            {loading ? '⏳ Processing...' : '💸 Withdraw to PIX'}
          </button>

          {withdrawResult && (
            <div style={styles.resultCard}>
              <h4>✅ Withdrawal Requested</h4>
              <p>TX: {withdrawResult.blockchainTxHash}</p>
              <p>Value: {withdrawResult.gtkAmount} GTK → ~{withdrawResult.estimatedBRL}</p>
              <p>Arrival: {withdrawResult.estimatedArrival}</p>
              <button onClick={() => setWithdrawResult(null)} style={styles.btnSmall}>Clear</button>
            </div>
          )}
        </div>
      </>
    );
  }

  function renderRedemption() {
    return (
      <>
        <h2 style={styles.sectionTitle}>🏆 Physical Gold Redemption</h2>
        <p style={styles.sectionSub}>Redeem your GTK for physical gold bars</p>

        <div style={styles.infoCard}>
          <h4>Redemption Rules</h4>
          <ul style={styles.list}>
            <li>Minimum: 100g GTK</li>
            <li>Fee: 0.5%</li>
            <li>Delivery: insured, tracked shipping</li>
            <li>Purity: 99.99% (24K)</li>
            <li>Vault: Brink's Zurich / Sao Paulo</li>
          </ul>
        </div>

        <div style={styles.formCard}>
          <label style={styles.label}>Amount to Redeem (grams)</label>
          <div style={styles.inputGroup}>
            <input
              type="number"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              placeholder="100"
              min="100"
              style={styles.inputLarge}
            />
            <span style={styles.inputSuffix}>GTK</span>
          </div>
          <p style={styles.hint}>Balance: {api.formatGTK(balance)} GTK | Min: 100g</p>

          {withdrawAmount >= 100 && (
            <div style={styles.preview}>
              <div style={styles.previewRow}><span>You redeem</span><strong>{withdrawAmount}g Gold</strong></div>
              <div style={styles.previewRow}><span>Market value</span><strong>{api.formatUSD(withdrawAmount * goldPrice)}</strong></div>
              <div style={styles.previewRow}><span>Fee (0.5%)</span><strong>{api.formatUSD(withdrawAmount * goldPrice * 0.005)}</strong></div>
              <div style={styles.previewDivider} />
              <div style={styles.previewRow}><span>You receive</span><strong>{withdrawAmount}g of 99.99% Gold</strong></div>
            </div>
          )}

          <button
            onClick={handleRedemption}
            disabled={loading || !withdrawAmount || withdrawAmount < 100}
            style={{ ...styles.btnPrimaryFull, background: 'linear-gradient(135deg, #b8860b, #ffd700)' }}
          >
            {loading ? '⏳ Processing...' : '🏆 Request Physical Gold'}
          </button>
        </div>
      </>
    );
  }

  function renderAdmin() {
    return (
      <>
        <h2 style={styles.sectionTitle}>⚙️ Admin Panel</h2>

        <div style={styles.adminGrid}>
          <div style={styles.healthCard}>
            <h3 style={styles.cardTitle}>System Metrics</h3>
            <div style={styles.metricsList}>
              <div style={styles.metricRow}>
                <span>Network</span>
                <strong>{chainId === 11155111 ? 'Sepolia' : chainId === 1 ? 'Mainnet' : 'Unknown'}</strong>
              </div>
              <div style={styles.metricRow}>
                <span>Token Supply</span>
                <strong>{systemInfo ? api.formatGTK(systemInfo.totalSupply) : '...'} GTK</strong>
              </div>
              <div style={styles.metricRow}>
                <span>Gold Reserves</span>
                <strong>{systemInfo ? api.formatGTK(systemInfo.totalGoldReserves) : '...'} g</strong>
              </div>
              <div style={styles.metricRow}>
                <span>Reserve Ratio</span>
                <strong>{systemInfo?.reserveRatio || '...'}</strong>
              </div>
              <div style={styles.metricRow}>
                <span>Gold Price</span>
                <strong>{api.formatUSD(goldPrice)}/g</strong>
              </div>
              <div style={styles.metricRow}>
                <span>Active Gold Bars</span>
                <strong>{activeBars}</strong>
              </div>
            </div>
          </div>

          <div style={styles.healthCard}>
            <h3 style={styles.cardTitle}>Address Lookup</h3>
            <div style={styles.adminLookup}>
              <input
                type="text"
                value={adminAddress}
                onChange={(e) => setAdminAddress(e.target.value)}
                placeholder="0x..."
                style={styles.input}
              />
              <button onClick={handleAdminLookup} style={styles.btnSmall}>Search</button>
            </div>
            {adminBalance && (
              <div style={styles.lookupResult}>
                <p><strong>Balance:</strong> {api.formatGTK(adminBalance.gtkBalance)} GTK</p>
                <p><strong>USD Value:</strong> {api.formatUSD(adminBalance.estimatedUSDValue)}</p>
                <p><strong>USDT:</strong> {api.formatUSD(adminBalance.usdtBalance)}</p>
              </div>
            )}
            {adminKYC && (
              <div style={styles.lookupResult}>
                <p><strong>KYC Tier:</strong> {adminKYC.tier}</p>
                <p><strong>Verified:</strong> {adminKYC.isVerified ? '✅' : '❌'}</p>
                <p><strong>Blacklisted:</strong> {adminKYC.isBlacklisted ? '🚫' : '✅'}</p>
              </div>
            )}
          </div>
        </div>
      </>
    );
  }
}

const dashboardStyles = {
  container: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    background: '#0a0e27',
    color: '#e2e8f0',
    minHeight: '100vh',
    maxWidth: '1440px',
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 24px',
    borderBottom: '1px solid #1a1f3a',
    background: '#0d1233',
  },
  logo: { display: 'flex', alignItems: 'center', gap: 12 },
  logoIcon: { fontSize: 32 },
  title: { fontSize: 20, fontWeight: 700, margin: 0, color: '#ffd700' },
  subtitle: { fontSize: 12, color: '#64748b', margin: 0 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 12 },
  badge: {
    background: '#1e293b',
    color: '#94a3b8',
    padding: '4px 12px',
    borderRadius: 16,
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  walletInfo: { display: 'flex', alignItems: 'center', gap: 8 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: '#22c55e',
    display: 'inline-block',
  },
  address: { fontFamily: 'monospace', fontSize: 13, color: '#94a3b8' },
  btnConnect: {
    background: 'linear-gradient(135deg, #ffd700, #ffed4e)',
    color: '#0a0e27',
    border: 'none',
    padding: '8px 20px',
    borderRadius: 8,
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: 13,
  },
  btnSmall: {
    background: '#1e293b',
    color: '#94a3b8',
    border: '1px solid #334155',
    padding: '4px 12px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 12,
  },
  error: {
    background: '#7f1d1d',
    color: '#fca5a5',
    padding: '12px 24px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 14,
  },
  errorClose: {
    background: 'none',
    border: 'none',
    color: '#fca5a5',
    fontSize: 20,
    cursor: 'pointer',
  },
  layout: { display: 'flex', minHeight: 'calc(100vh - 80px)' },
  sidebar: {
    width: 200,
    background: '#0d1233',
    borderRight: '1px solid #1a1f3a',
    padding: '16px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 14px',
    border: 'none',
    background: 'transparent',
    color: '#64748b',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
    textAlign: 'left',
    transition: 'all 0.15s',
    width: '100%',
  },
  navItemActive: {
    background: '#1a1f3a',
    color: '#ffd700',
  },
  content: { flex: 1, padding: '24px 32px', overflow: 'auto' },
  sectionTitle: { fontSize: 22, fontWeight: 700, margin: '0 0 4px 0', color: '#f1f5f9' },
  sectionSub: { fontSize: 14, color: '#64748b', margin: '0 0 24px 0' },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 16,
    marginBottom: 24,
  },
  statCard: {
    background: '#1a1f3a',
    padding: 20,
    borderRadius: 12,
    border: '1px solid #2a3060',
    position: 'relative',
    overflow: 'hidden',
  },
  statIcon: { fontSize: 24, marginBottom: 8 },
  statLabel: { fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  statValue: { fontSize: 26, fontWeight: 700, color: '#ffd700', marginBottom: 2 },
  statUnit: { fontSize: 14, fontWeight: 400, color: '#64748b' },
  statSub: { fontSize: 13, color: '#64748b' },
  healthRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: 16,
    marginBottom: 24,
  },
  healthCard: {
    background: '#1a1f3a',
    padding: 20,
    borderRadius: 12,
    border: '1px solid #2a3060',
  },
  cardTitle: { fontSize: 14, fontWeight: 600, color: '#94a3b8', margin: '0 0 16px 0', textTransform: 'uppercase', letterSpacing: 0.5 },
  healthList: { display: 'flex', flexDirection: 'column', gap: 12 },
  healthItem: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 },
  healthDot: { width: 8, height: 8, borderRadius: '50%', display: 'inline-block', flexShrink: 0 },
  quickActions: { display: 'flex', flexDirection: 'column', gap: 8 },
  btnPrimary: {
    background: 'linear-gradient(135deg, #ffd700, #ffed4e)',
    color: '#0a0e27',
    border: 'none',
    padding: '10px 16px',
    borderRadius: 8,
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: 13,
  },
  btnPrimaryFull: {
    background: 'linear-gradient(135deg, #ffd700, #ffed4e)',
    color: '#0a0e27',
    border: 'none',
    padding: '14px 24px',
    borderRadius: 10,
    fontWeight: 700,
    cursor: 'pointer',
    fontSize: 15,
    width: '100%',
    marginTop: 16,
  },
  btnSecondary: {
    background: '#1e293b',
    color: '#e2e8f0',
    border: '1px solid #334155',
    padding: '10px 16px',
    borderRadius: 8,
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: 13,
  },
  btnWarning: {
    background: '#78350f',
    color: '#fcd34d',
    border: '1px solid #92400e',
    padding: '10px 16px',
    borderRadius: 8,
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: 13,
  },
  kycForm: {
    background: '#1a1f3a',
    padding: 24,
    borderRadius: 12,
    border: '1px solid #2a3060',
    marginBottom: 24,
  },
  form: { display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 400 },
  input: {
    width: '100%',
    padding: '10px 14px',
    background: '#0d1233',
    border: '1px solid #2a3060',
    borderRadius: 8,
    color: '#e2e8f0',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
  },
  inputLarge: {
    flex: 1,
    padding: '10px 14px',
    background: '#0d1233',
    border: 'none',
    borderRadius: 8,
    color: '#e2e8f0',
    fontSize: 14,
    outline: 'none',
  },
  inputGroup: {
    display: 'flex',
    alignItems: 'center',
    background: '#0d1233',
    border: '1px solid #2a3060',
    borderRadius: 8,
    overflow: 'hidden',
  },
  inputPrefix: {
    padding: '10px 12px',
    color: '#64748b',
    fontWeight: 600,
    fontSize: 14,
    borderRight: '1px solid #2a3060',
  },
  inputSuffix: {
    padding: '10px 12px',
    color: '#64748b',
    fontWeight: 600,
    fontSize: 14,
    borderLeft: '1px solid #2a3060',
  },
  label: { display: 'block', fontSize: 13, color: '#94a3b8', marginBottom: 6, fontWeight: 500 },
  hint: { fontSize: 12, color: '#64748b', marginTop: 6 },
  preview: {
    background: '#0d1233',
    padding: 16,
    borderRadius: 10,
    marginTop: 16,
    border: '1px solid #2a3060',
  },
  previewRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: 13 },
  previewDivider: { height: 1, background: '#2a3060', margin: '8px 0' },
  formCard: {
    background: '#1a1f3a',
    padding: 24,
    borderRadius: 12,
    border: '1px solid #2a3060',
    maxWidth: 500,
  },
  resultCard: {
    background: '#0d1233',
    padding: 16,
    borderRadius: 10,
    marginTop: 16,
    border: '1px solid #22c55e',
  },
  pixCode: {
    background: '#0a0e27',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  code: {
    display: 'block',
    wordBreak: 'break-all',
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 4,
  },
  codeArea: {
    width: '100%',
    background: '#0a0e27',
    color: '#94a3b8',
    border: 'none',
    fontSize: 11,
    fontFamily: 'monospace',
    marginTop: 4,
    resize: 'none',
  },
  infoCard: {
    background: '#1a1f3a',
    padding: 20,
    borderRadius: 12,
    border: '1px solid #2a3060',
    marginBottom: 16,
    maxWidth: 500,
  },
  list: { paddingLeft: 16, fontSize: 13, lineHeight: 2, color: '#94a3b8' },
  adminGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: 16,
  },
  metricsList: { display: 'flex', flexDirection: 'column', gap: 8 },
  metricRow: { display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' },
  adminLookup: { display: 'flex', gap: 8, marginBottom: 12 },
  lookupResult: {
    background: '#0d1233',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
    fontSize: 13,
  },
};
