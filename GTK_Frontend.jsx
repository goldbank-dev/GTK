
// ============================================================
// GTK BANK FRONTEND - React + Web3.js
// ============================================================
// npm install react react-dom ethers @web3-react/core @web3-react/injected-connector
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { useWeb3React } from '@web3-react/core';
import { InjectedConnector } from '@web3-react/injected-connector';

// ============================================================
// CONFIGURAÇÃO
// ============================================================
const GTK_TOKEN_ADDRESS = process.env.REACT_APP_GTK_TOKEN_ADDRESS;
const GTK_BANK_ADDRESS = process.env.REACT_APP_GTK_BANK_ADDRESS;
const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://api.gtk.bank';

const injected = new InjectedConnector({
    supportedChainIds: [1, 56, 137, 42161] // Mainnet, BSC, Polygon, Arbitrum
});

const GTK_ABI = [
    "function balanceOf(address account) view returns (uint256)",
    "function totalSupply() view returns (uint256)",
    "function goldPricePerGram() view returns (uint256)",
    "function totalGoldReserves() view returns (uint256)",
    "function isFullyBacked() view returns (bool)",
    "function decimals() view returns (uint8)",
    "function getTokenValueInUSD(uint256 amountGrams) view returns (uint256)",
    "function getReserveRatio() view returns (uint256)",
    "function requestRedemption(uint256 amountGrams, string memory deliveryAddress) external returns (uint256)",
    "function blacklisted(address) view returns (bool)",
    "event TokensMinted(address indexed to, uint256 amountGrams, uint256 goldPriceAtMint)"
];

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================
function GTKBankApp() {
    const { active, account, library, activate, deactivate } = useWeb3React();
    const [balance, setBalance] = useState('0');
    const [goldPrice, setGoldPrice] = useState(0);
    const [totalSupply, setTotalSupply] = useState('0');
    const [isBacked, setIsBacked] = useState(true);
    const [loading, setLoading] = useState(false);
    const [depositAmount, setDepositAmount] = useState('');
    const [withdrawAmount, setWithdrawAmount] = useState('');
    const [pixKey, setPixKey] = useState('');
    const [transactions, setTransactions] = useState([]);
    const [kycStatus, setKycStatus] = useState(null);
    const [activeTab, setActiveTab] = useState('dashboard');

    // Conectar wallet
    const connectWallet = useCallback(async () => {
        try {
            await activate(injected);
        } catch (error) {
            console.error('Connection failed:', error);
        }
    }, [activate]);

    // Desconectar wallet
    const disconnectWallet = useCallback(() => {
        deactivate();
    }, [deactivate]);

    // Buscar dados do usuário
    useEffect(() => {
        if (!active || !account || !library) return;

        const fetchData = async () => {
            try {
                const provider = library;
                const gtkToken = new ethers.Contract(GTK_TOKEN_ADDRESS, GTK_ABI, provider);

                const [bal, price, supply, backed] = await Promise.all([
                    gtkToken.balanceOf(account),
                    gtkToken.goldPricePerGram(),
                    gtkToken.totalSupply(),
                    gtkToken.isFullyBacked()
                ]);

                setBalance(ethers.formatUnits(bal, 18));
                setGoldPrice(Number(price) / 10**8);
                setTotalSupply(ethers.formatUnits(supply, 18));
                setIsBacked(backed);

                // Buscar KYC
                const kycResponse = await fetch(`${API_BASE_URL}/api/v1/kyc/${account}`);
                if (kycResponse.ok) {
                    setKycStatus(await kycResponse.json());
                }

                // Buscar transações
                const txResponse = await fetch(`${API_BASE_URL}/api/v1/transactions/${account}`);
                if (txResponse.ok) {
                    setTransactions(await txResponse.json());
                }
            } catch (error) {
                console.error('Data fetch error:', error);
            }
        };

        fetchData();
        const interval = setInterval(fetchData, 30000); // Atualiza a cada 30s
        return () => clearInterval(interval);
    }, [active, account, library]);

    // Criar PIX para depósito
    const createDeposit = async () => {
        if (!depositAmount || depositAmount <= 0) return;

        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/v1/deposit/pix/create`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': process.env.REACT_APP_API_KEY
                },
                body: JSON.stringify({
                    userAddress: account,
                    amountBRL: parseFloat(depositAmount)
                })
            });

            if (!response.ok) throw new Error('Failed to create PIX');

            const data = await response.json();

            // Exibe QR Code
            alert(`PIX criado!\nID: ${data.pixId}\nValor: R$ ${data.amountBRL}\nQR Code: ${data.qrCode}`);

            setDepositAmount('');
        } catch (error) {
            console.error('Deposit error:', error);
            alert('Erro ao criar PIX: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    // Solicitar saque
    const requestWithdrawal = async () => {
        if (!withdrawAmount || withdrawAmount <= 0 || !pixKey) return;

        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/v1/withdrawal/pix`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': process.env.REACT_APP_API_KEY
                },
                body: JSON.stringify({
                    userAddress: account,
                    gtkAmount: parseFloat(withdrawAmount),
                    pixKey: pixKey
                })
            });

            if (!response.ok) throw new Error('Withdrawal failed');

            const data = await response.json();
            alert(`Saque solicitado!\nID: ${data.withdrawalId}\nValor: ${withdrawAmount} GTK\nPIX: ${pixKey}`);

            setWithdrawAmount('');
            setPixKey('');
        } catch (error) {
            console.error('Withdrawal error:', error);
            alert('Erro no saque: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    // Resgatar ouro físico
    const requestRedemption = async () => {
        if (!withdrawAmount || withdrawAmount < 100) {
            alert('Mínimo de 100g para resgate físico');
            return;
        }

        setLoading(true);
        try {
            const signer = library.getSigner();
            const gtkToken = new ethers.Contract(GTK_TOKEN_ADDRESS, GTK_ABI, signer);

            const amountWei = ethers.parseUnits(withdrawAmount, 18);
            const deliveryAddress = prompt('Endereço de entrega:');

            if (!deliveryAddress) return;

            const tx = await gtkToken.requestRedemption(amountWei, deliveryAddress);
            const receipt = await tx.wait();

            alert(`Resgate solicitado!\nTX: ${receipt.hash}`);
        } catch (error) {
            console.error('Redemption error:', error);
            alert('Erro no resgate: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    // Calcular valor em USD
    const calculateUSDValue = (grams) => {
        return (parseFloat(grams) * goldPrice).toFixed(2);
    };

    // ============================================================
    // RENDERIZAÇÃO
    // ============================================================
    return (
        <div className="gtk-bank-app">
            <header className="app-header">
                <div className="logo">
                    <img src="/gtk-logo.svg" alt="GTK Bank" />
                    <h1>GTK Bank</h1>
                </div>
                <div className="wallet-section">
                    {active ? (
                        <div className="wallet-connected">
                            <span className="address">{account.slice(0, 6)}...{account.slice(-4)}</span>
                            <button onClick={disconnectWallet} className="btn-disconnect">Desconectar</button>
                        </div>
                    ) : (
                        <button onClick={connectWallet} className="btn-connect">Conectar Wallet</button>
                    )}
                </div>
            </header>

            {!active ? (
                <div className="connect-prompt">
                    <h2>Bem-vindo ao GTK Bank</h2>
                    <p>Conecte sua wallet para acessar sua conta bancária lastreada em ouro.</p>
                    <button onClick={connectWallet} className="btn-primary">Conectar MetaMask</button>
                </div>
            ) : (
                <main className="app-main">
                    {/* Navegação */}
                    <nav className="app-nav">
                        <button 
                            className={activeTab === 'dashboard' ? 'active' : ''}
                            onClick={() => setActiveTab('dashboard')}
                        >
                            Dashboard
                        </button>
                        <button 
                            className={activeTab === 'deposit' ? 'active' : ''}
                            onClick={() => setActiveTab('deposit')}
                        >
                            Depositar
                        </button>
                        <button 
                            className={activeTab === 'withdraw' ? 'active' : ''}
                            onClick={() => setActiveTab('withdraw')}
                        >
                            Sacar
                        </button>
                        <button 
                            className={activeTab === 'history' ? 'active' : ''}
                            onClick={() => setActiveTab('history')}
                        >
                            Histórico
                        </button>
                    </nav>

                    {/* Dashboard */}
                    {activeTab === 'dashboard' && (
                        <section className="dashboard">
                            <div className="stats-grid">
                                <div className="stat-card">
                                    <h3>Saldo GTK</h3>
                                    <p className="value">{parseFloat(balance).toFixed(4)} g</p>
                                    <p className="sub-value">≈ ${calculateUSDValue(balance)} USD</p>
                                </div>
                                <div className="stat-card">
                                    <h3>Preço do Ouro</h3>
                                    <p className="value">${goldPrice.toFixed(2)}/g</p>
                                    <p className="sub-value">Atualizado em tempo real</p>
                                </div>
                                <div className="stat-card">
                                    <h3>Reservas</h3>
                                    <p className="value">{isBacked ? '100% Lastreado' : '⚠️ Atenção'}</p>
                                    <p className="sub-value">{parseFloat(totalSupply).toFixed(0)}g em circulação</p>
                                </div>
                                <div className="stat-card">
                                    <h3>Status KYC</h3>
                                    <p className="value">{kycStatus?.isVerified ? '✅ Verificado' : '❌ Pendente'}</p>
                                    <p className="sub-value">{kycStatus?.country || 'N/A'}</p>
                                </div>
                            </div>

                            <div className="gold-backing-proof">
                                <h3>Prova de Reservas</h3>
                                <p>Todo GTK é lastreado 1:1 em ouro físico armazenado em cofres auditados.</p>
                                <a href="/reserves" target="_blank" className="btn-link">
                                    Ver Auditoria Completa →
                                </a>
                            </div>
                        </section>
                    )}

                    {/* Depósito */}
                    {activeTab === 'deposit' && (
                        <section className="deposit-section">
                            <h2>Depositar via PIX</h2>
                            <p>Converta BRL em GTK automaticamente via PIX.</p>

                            <div className="input-group">
                                <label>Valor em BRL</label>
                                <input
                                    type="number"
                                    value={depositAmount}
                                    onChange={(e) => setDepositAmount(e.target.value)}
                                    placeholder="1000.00"
                                    min="50"
                                />
                                <span className="hint">Mínimo: R$ 50,00</span>
                            </div>

                            {depositAmount && (
                                <div className="preview">
                                    <p>Você receberá aproximadamente:</p>
                                    <p className="preview-amount">
                                        {((parseFloat(depositAmount) * 0.20 * 10**20) / (goldPrice * 10**8) / 10**18).toFixed(4)} GTK
                                    </p>
                                    <p className="preview-sub">
                                        ≈ ${(parseFloat(depositAmount) * 0.20).toFixed(2)} USD
                                    </p>
                                    <p className="fee-notice">Taxa: 0.5% | Spread: 0.3%</p>
                                </div>
                            )}

                            <button 
                                onClick={createDeposit} 
                                disabled={loading || !depositAmount}
                                className="btn-primary"
                            >
                                {loading ? 'Processando...' : 'Gerar PIX'}
                            </button>
                        </section>
                    )}

                    {/* Saque */}
                    {activeTab === 'withdraw' && (
                        <section className="withdraw-section">
                            <h2>Sacar para Conta Bancária</h2>
                            <p>Converta GTK em BRL via PIX.</p>

                            <div className="input-group">
                                <label>Quantidade GTK (gramas)</label>
                                <input
                                    type="number"
                                    value={withdrawAmount}
                                    onChange={(e) => setWithdrawAmount(e.target.value)}
                                    placeholder="100"
                                    min="1"
                                />
                                <span className="hint">Saldo: {parseFloat(balance).toFixed(4)}g</span>
                            </div>

                            <div className="input-group">
                                <label>Chave PIX</label>
                                <input
                                    type="text"
                                    value={pixKey}
                                    onChange={(e) => setPixKey(e.target.value)}
                                    placeholder="CPF, email, celular ou chave aleatória"
                                />
                            </div>

                            {withdrawAmount && (
                                <div className="preview">
                                    <p>Você receberá aproximadamente:</p>
                                    <p className="preview-amount">
                                        R$ {((parseFloat(withdrawAmount) * goldPrice) / 0.20 * 0.9925).toFixed(2)}
                                    </p>
                                    <p className="fee-notice">Taxa: 0.75% | Prazo: 1-2 dias úteis</p>
                                </div>
                            )}

                            <div className="action-buttons">
                                <button 
                                    onClick={requestWithdrawal} 
                                    disabled={loading || !withdrawAmount || !pixKey}
                                    className="btn-primary"
                                >
                                    {loading ? 'Processando...' : 'Sacar para PIX'}
                                </button>
                                <button 
                                    onClick={requestRedemption}
                                    disabled={loading || !withdrawAmount || withdrawAmount < 100}
                                    className="btn-secondary"
                                >
                                    Resgatar Ouro Físico (min 100g)
                                </button>
                            </div>
                        </section>
                    )}

                    {/* Histórico */}
                    {activeTab === 'history' && (
                        <section className="history-section">
                            <h2>Histórico de Transações</h2>

                            {transactions.length === 0 ? (
                                <p className="empty">Nenhuma transação encontrada.</p>
                            ) : (
                                <table className="transactions-table">
                                    <thead>
                                        <tr>
                                            <th>Data</th>
                                            <th>Tipo</th>
                                            <th>Valor</th>
                                            <th>Status</th>
                                            <th>TX Hash</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {transactions.map((tx, index) => (
                                            <tr key={index}>
                                                <td>{new Date(tx.timestamp).toLocaleDateString('pt-BR')}</td>
                                                <td className={tx.type}>{tx.type}</td>
                                                <td>{tx.amount} {tx.currency}</td>
                                                <td className={`status ${tx.status}`}>{tx.status}</td>
                                                <td>
                                                    <a 
                                                        href={`https://etherscan.io/tx/${tx.hash}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                    >
                                                        {tx.hash.slice(0, 10)}...
                                                    </a>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </section>
                    )}
                </main>
            )}

            <footer className="app-footer">
                <p>GTK Bank © 2026 - Token lastreado em ouro físico</p>
                <div className="links">
                    <a href="/terms">Termos</a>
                    <a href="/privacy">Privacidade</a>
                    <a href="/audits">Auditorias</a>
                    <a href="/reserves">Reservas</a>
                </div>
            </footer>
        </div>
    );
}

// ============================================================
// ESTILOS CSS (inline para simplicidade)
// ============================================================
const styles = `
.gtk-bank-app {
    font-family: 'Inter', -apple-system, sans-serif;
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
    background: #0a0e27;
    color: #fff;
    min-height: 100vh;
}

.app-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 0;
    border-bottom: 1px solid #1a1f3a;
    margin-bottom: 30px;
}

.logo {
    display: flex;
    align-items: center;
    gap: 12px;
}

.logo h1 {
    font-size: 24px;
    font-weight: 700;
    background: linear-gradient(135deg, #ffd700, #ffed4e);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
}

.wallet-section button {
    padding: 10px 24px;
    border-radius: 8px;
    border: none;
    cursor: pointer;
    font-weight: 600;
    transition: all 0.3s;
}

.btn-connect {
    background: linear-gradient(135deg, #ffd700, #ffed4e);
    color: #0a0e27;
}

.btn-disconnect {
    background: #1a1f3a;
    color: #fff;
}

.connect-prompt {
    text-align: center;
    padding: 100px 20px;
}

.connect-prompt h2 {
    font-size: 36px;
    margin-bottom: 16px;
}

.connect-prompt p {
    color: #8b92b4;
    margin-bottom: 32px;
}

.btn-primary {
    background: linear-gradient(135deg, #ffd700, #ffed4e);
    color: #0a0e27;
    padding: 14px 32px;
    border: none;
    border-radius: 8px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.2s;
}

.btn-primary:hover {
    transform: translateY(-2px);
}

.btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.app-nav {
    display: flex;
    gap: 8px;
    margin-bottom: 30px;
    background: #1a1f3a;
    padding: 8px;
    border-radius: 12px;
}

.app-nav button {
    padding: 10px 20px;
    border: none;
    background: transparent;
    color: #8b92b4;
    cursor: pointer;
    border-radius: 8px;
    font-weight: 500;
    transition: all 0.3s;
}

.app-nav button.active,
.app-nav button:hover {
    background: #ffd700;
    color: #0a0e27;
}

.stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 20px;
    margin-bottom: 30px;
}

.stat-card {
    background: #1a1f3a;
    padding: 24px;
    border-radius: 12px;
    border: 1px solid #2a3060;
}

.stat-card h3 {
    font-size: 14px;
    color: #8b92b4;
    margin-bottom: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.stat-card .value {
    font-size: 28px;
    font-weight: 700;
    color: #ffd700;
    margin-bottom: 4px;
}

.stat-card .sub-value {
    font-size: 14px;
    color: #8b92b4;
}

.input-group {
    margin-bottom: 20px;
}

.input-group label {
    display: block;
    margin-bottom: 8px;
    color: #8b92b4;
    font-size: 14px;
}

.input-group input {
    width: 100%;
    padding: 14px;
    background: #1a1f3a;
    border: 1px solid #2a3060;
    border-radius: 8px;
    color: #fff;
    font-size: 16px;
    transition: border-color 0.3s;
}

.input-group input:focus {
    outline: none;
    border-color: #ffd700;
}

.hint {
    display: block;
    margin-top: 6px;
    font-size: 12px;
    color: #8b92b4;
}

.preview {
    background: #1a1f3a;
    padding: 20px;
    border-radius: 12px;
    margin-bottom: 20px;
    border: 1px solid #2a3060;
}

.preview-amount {
    font-size: 24px;
    font-weight: 700;
    color: #ffd700;
    margin: 8px 0;
}

.fee-notice {
    font-size: 12px;
    color: #8b92b4;
    margin-top: 8px;
}

.transactions-table {
    width: 100%;
    border-collapse: collapse;
}

.transactions-table th,
.transactions-table td {
    padding: 16px;
    text-align: left;
    border-bottom: 1px solid #2a3060;
}

.transactions-table th {
    color: #8b92b4;
    font-weight: 500;
    font-size: 12px;
    text-transform: uppercase;
}

.transactions-table .deposit { color: #4ade80; }
.transactions-table .withdrawal { color: #f87171; }
.transactions-table .status.completed { color: #4ade80; }
.transactions-table .status.pending { color: #fbbf24; }

.app-footer {
    margin-top: 60px;
    padding: 30px 0;
    border-top: 1px solid #1a1f3a;
    text-align: center;
    color: #8b92b4;
}

.app-footer .links {
    margin-top: 16px;
    display: flex;
    justify-content: center;
    gap: 24px;
}

.app-footer a {
    color: #8b92b4;
    text-decoration: none;
    transition: color 0.3s;
}

.app-footer a:hover {
    color: #ffd700;
}
`;

// Adiciona styles ao documento
const styleSheet = document.createElement("style");
styleSheet.innerText = styles;
document.head.appendChild(styleSheet);

export default GTKBankApp;
