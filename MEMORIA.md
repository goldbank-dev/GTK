# GTK (Gold Token) — Memória do Projeto

> Última atualização: 15/05/2026
> Super memória de todas as interações, decisões e configurações.

---

## Índice
1. [Visão Geral](#1-visão-geral)
2. [Arquitetura dos Contratos](#2-arquitetura-dos-contratos)
3. [Wallets e Chaves](#3-wallets-e-chaves)
4. [Deploy Sepolia](#4-deploy-sepolia)
5. [Status do .env](#5-status-do-env)
6. [Testes](#6-testes)
7. [Pipeline](#7-pipeline)
8. [Frontend e API](#8-frontend-e-api)
9. [Próximos Passos](#9-próximos-passos)
10. [Comandos Úteis](#10-comandos-úteis)

---

## 1. Visão Geral

**GTK (Gold Token)** — Token ERC-20 upgradeable lastreado 1:1 em ouro físico.
- **1 GTK = 1 grama de ouro 99.99%**
- Oráculo de preço descentralizado (Chainlink XAU/USD + fallback manual)
- Banco integrado com PIX (BRL → USDT → GTK)
- Compliance com KYC/Blacklist
- Custódia de barras de ouro com auditoria
- Resgate físico (mínimo 100g, taxa 0.5%)
- Governança DAO
- Upgradeable via UUPS proxy

### Tecnologias
- **Blockchain**: Ethereum (Solidity 0.8.20, Hardhat v2.28.6)
- **Backend**: Node.js + Express + ethers.js v6
- **Frontend**: React + ethers.js + web3-react
- **Oráculo**: Chainlink XAU/USD feed
- **Proxy**: OpenZeppelin UUPS Upgradeable
- **Testes**: Hardhat + Chai + ethers

---

## 2. Arquitetura dos Contratos

### Estrutura de Diretórios
```
contracts/
├── token/GTKToken.sol          # Token ERC-20 upgradeable
├── oracle/GTKPriceOracle.sol    # Oráculo dual Chainlink + manual
├── bank/GTKBank.sol             # Banco integrado PIX↔USDT↔GTK
├── governance/GTKGovernance.sol # Governança DAO
└── interfaces/IGTKToken.sol     # Interface compartilhada
```

### 2.1 GTKToken (`contracts/token/GTKToken.sol`)

**Herança**: ERC20Upgradeable, ERC20PausableUpgradeable, AccessControlUpgradeable, UUPSUpgradeable, ReentrancyGuardUpgradeable

**Roles**:
| Role | Descrição |
|------|-----------|
| `DEFAULT_ADMIN_ROLE` | Admin geral, gerencia roles |
| `MINTER_ROLE` | Emitir novos tokens |
| `BURNER_ROLE` | Queimar tokens (não usado diretamente) |
| `PAUSER_ROLE` | Pausar/despausar emergência |
| `UPGRADER_ROLE` | Autorizar upgrades do contrato |
| `COMPLIANCE_ROLE` | Gerenciar KYC e blacklist |
| `CUSTODIAN_ROLE` | Gerenciar custódia de ouro físico |

**Funções principais**:
- `initialize(admin, priceOracle)` — Inicializador do proxy
- `depositGold(serial, weight, purity, vault)` — Registrar barra de ouro
- `withdrawGold(serial, reason)` — Retirar barra da custódia
- `auditCustody(serial, verifiedWeight)` — Auditar barra
- `mint(to, amount, goldGrams, depositRef)` — Emitir tokens (requer KYC + reservas)
- `burn(amount, goldGrams, withdrawalRef)` — Queimar tokens
- `requestRedemption(amount, deliveryAddress)` — Solicitar resgate físico
- `processRedemption(requestId)` — Processar resgate (custodiante)
- `setBlacklist(account, status)` — Bloquear/desbloquear endereço
- `setKycTier(account, tier)` — Definir nível KYC (1-3)
- `pause() / unpause()` — Emergência
- `getTokenValueInUSD(amount)` — Calcular valor em USD
- `getReserveRatio()` — Taxa de lastro
- `isFullyBacked()` — Verificar se 100% lastreado

**Constantes**:
- `TOKEN_DECIMALS = 18`
- `MIN_REDEMPTION_GRAMS = 100 GTK` (100g mínimo)
- `REDEMPTION_FEE_BPS = 50` (0.5%)
- `BPS_DENOMINATOR = 10000`
- Limites diários: Tier 1 = 1kg, Tier 2 = 10kg, Tier 3 = ilimitado

### 2.2 GTKPriceOracle (`contracts/oracle/GTKPriceOracle.sol`)

**Herança**: AccessControl (não-upgradeable)

**Roles**: `PRICE_UPDATER_ROLE`, `DEFAULT_ADMIN_ROLE`

**Funcionamento**:
1. Tenta Chainlink XAU/USD feed primeiro
2. Se Chainlink falhar ou estiver stale (>1h), usa preço manual
3. Se Chainlink desviar >2% do manual, usa o manual (segurança contra manipulação)
4. Conversão: onça troy (31.1034768g) → grama

**Constantes**:
- `OZ_TO_GRAM = 3110347680` (31.1034768g com 8 decimais)
- `DEVIATION_THRESHOLD = 200` (2% em bps)

### 2.3 GTKBank (`contracts/bank/GTKBank.sol`)

**Herança**: AccessControlUpgradeable, ReentrancyGuardUpgradeable, UUPSUpgradeable

**Roles**: `OPERATOR_ROLE`, `DEFAULT_ADMIN_ROLE`

**Fluxo de Depósito PIX**:
```
Usuário → PIX BRL → Operador converte BRL→USDT → processDeposit() → 
USDT transferido do usuário → Mint GTK para usuário → Fee vai para tesouraria
```

**Fluxo de Saque**:
```
Usuário → requestWithdrawal() → Queima GTK → Operador envia PIX off-chain
```

**Fees**: Depósito 0.5%, Saque 0.75%

### 2.4 GTKGovernance (`contracts/governance/GTKGovernance.sol`)

**Herança**: AccessControl (não-upgradeable)

**Funcionamento**:
- Propostas com descrição, target e calldata
- Votação: 7 dias, quorum 1000 GTK
- Execução: aprovado se forVotes > againstVotes

---

## 3. Wallets e Chaves

### 3.1 Wallets Geradas (12/05/2026)

| Função | Endereço | Private Key | Mnemonic |
|--------|----------|-------------|----------|
| **DEPLOYER_MAINNET** | `0xfb2064beF37Bc25D4BE8e4aA31A8F3dbaa9f610C` | `0x7e903756d87ea22a1dbc2c7de5bb157436a1d1b1b60a1bb9a952784a591d8fed` | hundred child boat sing transfer identify winter genius success buzz upgrade tag |
| **DEPLOYER_TESTNET** | `0xBFF9E05C9C4c3e7C33cf82B956DCbd3C4513dAC3` | `0x036337fcc150d8e8708465c1d2f9968d767f54db57671749d967a6604bea5d6a` | six then churn hotel cabbage tunnel coyote spawn arrange icon tiny comic |
| **BANK_OPERATOR** | `0x04a8514542f2bFd68f26Ca3de3C9Ba00f947E9c7` | `0xc7fc35ae10b219c7c0d5b4b7b80012833f19fcf04c4930daab9ef7642ea49d10` | victory panther decrease name elite salute next bicycle artefact half clog message |

### 3.2 API Keys
- **Alchemy (Mainnet/Sepolia)**: `G6ZN1wc0IrKTFzbylMnjj`
- **Etherscan**: `2MM3GUT3EXN8DSBV4C4FP1QKNQ5SHDME4R`
- **Arbiscan**: `2MM3GUT3EXN8DSBV4C4FP1QKNQ5SHDME4R`
- **API Key (Backend)**: `gtk_api_key_prod_2026_a1b2c3d4e5`
- **API Key (Frontend)**: `gtk_fe_key_2026_f6g7h8i9j0`

### 3.3 Saldos
- Deployer Testnet (`0xBFF9...dAC3`): **~0.36 ETH** (Sepolia, obtido via faucet thirdweb)
- Demais wallets: sem fundos

---

## 4. Deploy Sepolia

### 4.1 Contratos Deployados (12/05/2026)

| Contrato | Endereço (Proxy) | Implementação | Status |
|----------|------------------|---------------|--------|
| **GTKPriceOracle** | `0x8DA918381c9feC2a84F53a6ba07F9fA83E8FbD3d` | N/A (non-proxy) | ✅ Verificado |
| **GTKToken** | `0x646C3a2A1D4A782Ce464c2Ddf0667aCcD689C2F5` | `0x9aCAc90691EA988e92E0E87a76871084B83D4184` | ✅ Verificado + linked |
| **GTKBank** | `0x938089e3C2514A088b26C6b813e51f3c1D0296dE` | `0x8F01e91a7F86b1DDCD2d6A4617ba898186A80A38` | ✅ Verificado + linked |

**Links Etherscan**:
- Oracle: https://sepolia.etherscan.io/address/0x8DA918381c9feC2a84F53a6ba07F9fA83E8FbD3d
- Token: https://sepolia.etherscan.io/address/0x646C3a2A1D4A782Ce464c2Ddf0667aCcD689C2F5
- Bank: https://sepolia.etherscan.io/address/0x938089e3C2514A088b26C6b813e51f3c1D0296dE

### 4.2 Configuração Pós-Deploy
- Preço inicial do ouro: **$65.00/grama** (setado via oracle + token)
- `MINTER_ROLE` e `BURNER_ROLE` concedidos ao GTKBank
- `PRICE_UPDATER_ROLE` concedido ao deployer
- Chainlink XAU/USD Sepolia feed: `0xC5981F461d74c46eB4b0CF3f4Ec79f025573B0Ea`
- USDT (mock Sepolia): `0x7169D38820dfd117C3FA1f22a697dBA58d90BA06`

### 4.3 Sanity Check (12/05/2026)
```
Token:  Gold Token (GTK)
Supply: 0.0 GTK
Gold:   $65.00/grama
Oracle: $65.00/grama (online + sincronizado)
Backed: 100% SIM
Versao: 1
```

---

## 5. Status do .env

### ✅ Configurado e Funcionando
- `MAINNET_RPC` — Alchemy endpoint
- `SEPOLIA_RPC` — Alchemy endpoint ✅ testado
- `ARBITRUM_RPC` — Arbitrum public RPC
- `ETHERSCAN_KEY` — API key ✅ (verificação funcionou)
- `DEPLOYER_PK` — Wallet mainnet real ✅
- `DEPLOYER_PK_TESTNET` — Wallet testnet real ✅ (com fundos)
- `BANK_PRIVATE_KEY` — Wallet operador real ✅
- `API_KEY` / `REACT_APP_API_KEY` — Chaves geradas ✅
- `GTK_TOKEN_ADDRESS` / `GTK_BANK_ADDRESS` — Preenchidos pós-deploy ✅
- `NETWORK=sepolia` — Modo testnet ✅

### ⚠️ Recomendações de Segurança
- `.env` está no `.gitignore` — não versionar
- Wallets são para testnet — gerar NOVAS wallets para mainnet
- Idealmente usar multisig (Gnosis Safe) para roles administrativas em produção

---

## 6. Testes

### 6.1 Testes Unitários — 33/33 passando

```bash
npx hardhat test
```

| Grupo | Testes | Status |
|-------|--------|--------|
| Deployment | 2 | ✅ |
| Minting | 5 | ✅ |
| Burning | 2 | ✅ |
| Transfers | 4 | ✅ |
| Custody | 4 | ✅ |
| Redemption | 4 | ✅ |
| Compliance | 3 | ✅ |
| Pause | 2 | ✅ |
| Reserve Ratio | 2 | ✅ |
| USD Value | 1 | ✅ |
| Upgradeability | 2 | ✅ |
| Security | 2 | ✅ |

### 6.2 Fuzzing (Echidna)
- `tests/unit/fuzzing/GTKTokenFuzz.sol`
- Invariantes: `totalSupply() <= totalGoldReserves`, blacklist bloqueia transfer

---

## 7. Pipeline

### Scripts npm

| Comando | Descrição |
|---------|-----------|
| `npm run compile` | Compilar Solidity |
| `npm test` | Rodar testes |
| `npm run test:fork` | Testar com fork da mainnet |
| `npm run deploy:sepolia` | Deploy na Sepolia |
| `npm run deploy:mainnet` | Deploy na Mainnet |
| `npm run verify` | Verificar contratos no Etherscan |

### Dependências Principais
```json
{
  "hardhat": "^2.28.6",
  "@nomicfoundation/hardhat-ethers": "^3.1.3",
  "@nomicfoundation/hardhat-chai-matchers": "^2.1.2",
  "@openzeppelin/hardhat-upgrades": "^3.9.0",
  "@openzeppelin/contracts-upgradeable": "^5.0.0",
  "@chainlink/contracts": "^1.5.0",
  "ethers": "^6.14.0",
  "dotenv": "^17.4.2"
}
```

---

## 8. Frontend e API

### 8.1 Frontend (`GTK_Frontend.jsx`)
React + ethers.js + web3-react:
- Conexão MetaMask (Ethereum, BSC, Polygon, Arbitrum)
- Dashboard com saldo GTK, preço do ouro, status reservas, KYC
- Depósito PIX: valor BRL → QR Code
- Saque PIX: GTK → BRL
- Resgate físico: mínimo 100g
- Histórico de transações

### 8.2 Backend API (`GTK_BankAPI.js`)
Express + ethers.js:
| Rota | Descrição |
|------|-----------|
| `GET /health` | Healthcheck |
| `GET /api/v1/system/info` | Info do sistema (supply, reservas, preço) |
| `POST /api/v1/deposit/pix/create` | Criar PIX para depósito |
| `POST /api/v1/deposit/pix/webhook` | Webhook de confirmação PIX |
| `POST /api/v1/withdrawal/pix` | Solicitar saque PIX |
| `GET /api/v1/balance/:address` | Consultar saldo |
| `GET /api/v1/deposit/pix/:pixId/status` | Status de depósito PIX |
| Cron job | Atualizar preço do ouro a cada 15 min |

### 8.3 ABIs Sincronizadas
Frontend e backend atualizados para os novos contratos unificados:
- `mint(address,uint256,uint256,bytes32)` — 4 params
- `burn(uint256,uint256,bytes32)` — 3 params
- `totalGoldReserves()` — novo nome
- `blacklisted(address)` — novo nome
- `kycTier(address)` — novo nome
- `processDeposit(...)` — bank API
- `requestWithdrawal(...)` — bank API

---

## 9. Roadmap para Mercado

### ✅ Concluído (Sessão 5 — 14/05/2026)
- [x] **API modularizada** (`src/api/`) com arquitetura de serviços:
  - `blockchainService.js` — Abstraction sobre contratos
  - `pixService.js` — Geração/gerenciamento de PIX
  - `kycService.js` — Integração Asaas (customer, KYC, webhook)
  - `exchangeService.js` — Taxas de câmbio multi-fonte
  - `routes/` — health, system, balance, deposit, withdrawal, kyc
  - `middleware/` — auth (API key), kycCheck, errorHandler
  - `cron/priceUpdater.js` — Atualização automática de preço
  - `server.js` — Entry point Express
- [x] **API Client** (`src/client/gtkApiClient.js`) — Service layer centralizado para frontend
- [x] **Environments** (`.env.staging`, `.env.production`) — Config separada por ambiente
- [x] **Dashboard operacional** (`src/dashboard/`) — UX/UI rica em componentes:
  - Overview (stats, health, KYC status, ações rápidas)
  - Deposit PIX (com preview BRL→GTK)
  - Withdrawal (GTK→BRL preview)
  - Physical Gold Redemption
  - Admin Panel (lookup, métricas do sistema)
- [x] **Testes automatizados**:
  - `tests/api/` — Testes de integração (health, system, balance, deposit, withdrawal, kyc)
  - `tests/dashboard/` — Snapshot e render tests (conectado/desconectado, responsivo)
  - `tests/e2e/` — Testes de fluxo crítico (cálculos, validações)
- [x] **Asaas KYC** — Integração com Asaas API v3 (customer, KYC request, webhook)
- [x] **Migração do `.env`** — Template staging/production com todas as variáveis
- [x] **Price oracle cron** — Multi-fonte (gold-api, metals-api) com fallback

### Imediatos (pós-deploy mainnet)
- [x] Gerar NOVAS wallets para mainnet (nunca reutilizar testnet) ✅ FASE 0
- [x] Deploy em mainnet com ETH real ✅ (24/05/2026)
- [x] Verificar contratos no Etherscan mainnet ✅
- [x] Integrar Chainlink XAU/USD real ✅
- [x] Integrar USDT real (mainnet) ✅
- [ ] Configurar multisig (Gnosis Safe) para admin roles
- [ ] Configurar domínios (app.gtk.bank, api.gtk.bank)
- [ ] SSL/TLS via Let's Encrypt / Cloudflare
- [ ] Deploy da API em produção (Docker + PM2)

### Próximas Features
- [ ] Dashboard de auditoria de barras de ouro (Brink's Integration)
- [ ] Notificações PIX em tempo real (WebSocket)
- [ ] Suporte a múltiplos idiomas (PT, EN, ES)
- [ ] Gráficos de preço histórico (TradingView widget)
- [ ] Exportação de relatórios fiscais
- [ ] App mobile (React Native)

### Segurança
- [ ] Rate limiting avançado por endpoint
- [ ] Harden de headers (helmet já configurado)
- [ ] Auditoria de contratos (empresa externa)
- [ ] Testes de fuzzing invariantes (Echidna)
- [ ] Bug bounty program

---

## 10. Comandos Úteis

```bash
# Compilar
npx hardhat compile

# Testar
npx hardhat test

# Testar arquivo específico
npx hardhat test tests/unit/GTKToken.test.ts

# Deploy Sepolia
npx hardhat run scripts/deploy/testnet-deploy.ts --network sepolia

# Deploy Mainnet
npx hardhat run scripts/deploy/mainnet-deploy.ts --network mainnet

# Verificar contrato
npx hardhat verify --network sepolia <ADDRESS> [ARGS...]

# Interagir (console)
npx hardhat console --network sepolia

# Gas report
npx hardhat test --gas

# Cobertura
npx hardhat coverage
```

---

## Histórico de Interações

### Sessão 1 (12/05/2026) — Fundação e Unificação
- Diagnóstico completo do projeto
- Identificadas 2 codebases divergentes (monolítico vs modular)
- Decisão: unificar mantendo o melhor de ambas
- Arquivo monolítico `GTK_SmartContracts.sol` → `_archive/`
- Contratos reescritos: `GTKToken.sol`, `GTKPriceOracle.sol`, `GTKBank.sol`
- Adicionados: `GTKGovernance.sol`, `IGTKToken.sol`
- Corrigidos: `OZ_TO_GRAM`, `_beforeTokenTransfer` → `_update`, evento `KYCR evoked`
- Package.json, hardhat.config, .gitignore, .env.example criados/atualizados
- Frontend e backend sincronizados com novos ABIs

### Sessão 2 (12/05/2026) — Compilação e Testes
- Hardhat v3 → v2.28.6 (compatibilidade)
- 33 testes escritos e passando
- TypeScript 6.0 + tsconfig configurado
- Todas as dependências resolvidas

### Sessão 3 (12/05/2026) — Wallets e .env
- 3 wallets geradas: DEPLOYER_MAINNET, DEPLOYER_TESTNET, BANK_OPERATOR
- Mnemônicas registradas e salvas
- API keys geradas para backend/frontend
- `.env` completamente configurado
- `NETWORK` alterado de `mainnet` → `sepolia` (segurança)

### Sessão 4 (12/05/2026) — Deploy Sepolia
- 0.365 ETH obtido via thirdweb faucet
- Deploy dos 3 contratos na Sepolia
- Verificação no Etherscan Sepolia (todos OK)
- Sanity check: token, oracle, price, backing — tudo operacional
- Endereços atualizados no `.env`

### Sessão 6 (15/05/2026) — Correções e Startup do Dashboard
- Corrigido `require('ethers')` → `import { ethers }` no `Withdraw.jsx` (quebra no Vite ESM)
- Corrigido `CustomEvent('nav')` → `onNavigate` prop no `Overview.jsx`
- Dashboard Vite + API backend prontos para rodar localmente
- Contratos na Sepolia operacionais (Token, Oracle, Bank)

### Sessão 5 (14/05/2026) — Preparação para Mercado
- **API modularizada** em serviços (blockchain, pix, kyc, exchange)
- **Middleware** de autenticação, KYC check, error handling
- **Rotas REST** organizadas: health, system, balance, deposit, withdrawal, kyc
- **Cron job** de preço (multi-fonte com fallback)
- **Environments** staging/production com `.env.staging` e `.env.production`
- **API Client** (`src/client/gtkApiClient.js`) — service layer centralizado
- **Dashboard operacional** completo com React:
  - Overview com stats, health, KYC, ações rápidas
  - Deposit PIX com preview BRL→GTK
  - Withdrawal GTK→BRL com cálculo de fee
  - Physical Gold Redemption
  - Admin Panel com lookup de endereços
- **Testes automatizados**:
  - API: health, system, balance, deposit, withdrawal, kyc (com mocks)
  - Dashboard: render states, responsive layout, formatação
  - E2E: cálculos de fluxo crítico, validações de negócio
- **Integração Asaas**: customer, KYC request, webhook PIX
- **Scripts npm**: `test:api`, `test:dashboard`, `test:e2e`, `start`, `dev`

### Sessão 7 (17/05/2026) — Ajustes Finais e Identidade Visual
- Corrigido erro de **CORS** na API: adicionada origem `http://localhost:5173` ao `ALLOWED_ORIGINS`.
- Corrigido **ReferenceError** no componente `Overview.jsx`: `systemInfo` agora é tratado como prop e com fallback seguro.
- Implementada **Trava de Rede**: Dashboard agora detecta se o usuário está fora da Sepolia e oferece botão para troca automática de rede.
- **Identidade Visual**: Emojis substituídos pelo logo oficial `icon.png` no Header e na tela de Welcome.
- **Ajuste de Ativos**: Corrigidos caminhos relativos de importação de imagens (`../` e `../../`).
- **Validação de Saldo**: Confirmado saldo de 50 GTK na rede Sepolia para a conta `...dAC3`.
- **Roadmap Criado**: Gerado arquivo `ROADMAP.md` com o plano de ação detalhado para o lançamento de amanhã na Mainnet.

### Sessão 8 (18/05/2026) — Fusão GTK + GoldBank Mobile + GCP + Fingerprint

#### GoldBank Mobile (`github.com/amos-fernandes/goldbank-mobile`)
- **Stack**: React Native 0.81 + Expo SDK 54 + TypeScript + Expo Router
- **Porta**: Metro 8081 | Backend local 8082
- **Fluxos existentes**: Auth (Login/Register/KYC), Wallet (PIX/saldo), Crypto (MB + Binance)
- **Integração Asaas**: Chave `$aact_prod_` (JÁ em produção) — mover para Secret Manager urgente
- **Persistência**: `db.json` (migrar para Cloud SQL)
- **Auth**: Token hex randômico sem expiração — migrar para JWT com `expiresIn: '7d'`

#### server-goldbank (`github.com/amos-fernandes/server-goldbank`)
**STATUS: v2.0 PUBLICADO — commit `069a8e7` (18/05/2026)**
**Repo local**: `C:\dev\goldbank-api\` (git inicializado, remote configurado)

`serve.js` reescrito de `http.createServer` para **Express** — 16.5KB (era 14.1KB).

Vulnerabilidades corrigidas:
1. ✅ `CORS: *` → whitelist via `ALLOWED_ORIGINS`
2. ✅ Token hex sem expiração → JWT `expiresIn: 7d`
3. ✅ Sem rate limiting → `express-rate-limit` (100 global + 5 login)
4. ✅ Sem headers de segurança → `helmet`
5. ✅ Sem HTTPS enforcement → redirect `x-forwarded-proto`

Novos endpoints GTK:
- `GET  /api/gtk/balance/:address`
- `GET  /api/gtk/price`
- `POST /api/gtk/deposit/pix/create`
- `POST /api/gtk/withdraw`
- `POST /api/security/verify-integrity` (Play Integrity + App Attest)
- `GET  /health`

Novos arquivos: `Dockerfile`, `.env.private.example`, `.gitignore`, `package.json` standalone

#### GoldBank Mobile — Integração GTK concluída (18/05/2026)
Local: `C:\dev\GTK\temp_mobile_repo\`
- `services/gtk.ts` — NOVO: hooks `useGetGTKBalance`, `useGetGTKPrice`, `useCreateGTKDeposit`, `useWithdrawGTK`, `useVerifyIntegrity`, formatadores
- `services/api.ts` — + timeout 12s, fingerprint headers automáticos, interceptor 401
- `components/GoldCard.tsx` — NOVO: card dourado com saldo em gramas, valor BRL, preço do oráculo, badge "100% LASTREADO"
- `app/(tabs)/wallet.tsx` — + GoldCard acima do WalletCard; botão "Comprar Ouro (GTK)"; modal brl/gold unificado
- `app/(tabs)/crypto.tsx` — + aba "⬡ Ouro GTK" como primeira aba com painel completo

#### Infra GCP — Pronta para execução (18/05/2026)
- `Dockerfile` — GTK API (node:20-alpine, porta 3000)
- `infra/cloud-sql-schema.sql` — 6 tabelas PostgreSQL 15 + índices + triggers
- `infra/gcp-setup.sh` — script completo passo-a-passo

#### Wallets de Produção Geradas (FASE 0 — 18/05/2026)
| Role | Endereço |
|------|----------|
| DEPLOYER_MAINNET | `0x40E006c4F132fEC2AC273Ea7CC802766136Bc236` |
| BANK_OPERATOR_MAINNET | `0xB361Fc97C8b72053F379fD68B99B69a8E0068788` |
| TREASURY_MAINNET | `0x2700E01fEfC51De0A15FE5b54E81dfB066692594` |
⚠️ Mnemônicas exibidas no terminal — usuário deve tê-las salvo offline.

#### Fingerprint / Security Lockdown (implementado)
- Anti-replay: `X-Request-Timestamp` janela 5min (ativo em prod no serve.js)
- Platform check: bloqueia origens não-mobile em prod
- SSL Pinning: pendente extração SHA-256 após GCP DNS propagação
- Play Integrity / App Attest: endpoint `/api/security/verify-integrity` implementado

#### Próximos passos pendentes
1. GCP: criar projeto `gtk-bank-prod` + billing → executar `infra/gcp-setup.sh`
2. Secret Manager: preencher 9 secrets com `.env.production.generated`
3. ETH: enviar 0.15–0.20 ETH para `0x40E006c4F132fEC2AC273Ea7CC802766136Bc236`
4. Deploy Mainnet: `npm run deploy:mainnet`
5. SSL Fingerprint: extrair SHA-256 após DNS + Cloud Run → `EXPO_PUBLIC_SSL_FINGERPRINT`
6. GoldBank Mobile: continuar integração no repo `github.com/amos-fernandes/goldbank-mobile`

---

### Sessão 9 (24/05/2026) — Deploy Mainnet 🚀
- ETH transferido da Binance para deployer: `0x40E006c4F132fEC2AC273Ea7CC802766136Bc236` (0.0139 ETH)
- Gas na mainnet: ~0.087 gwei (historicamente baixo)
- **Deploy dos 3 contratos na Ethereum Mainnet**:
  - GTKPriceOracle: `0x2167964CB20Dd614d644F2B2079461DA5e4E5797` ✅
  - GTKToken (UUPS proxy): `0x8751264B0f82cfE5DD3ad941b4d28FD7a0f896EA` ✅
  - GTKBank (UUPS proxy): `0xcF1870caF85bF28072d0aD3E7ef3D8620D48a204` ✅
- Todos verificados e linked no Etherscan ✅
- Roles configuradas: MINTER/BURNER para Bank, PRICE_UPDATER para deployer
- Preço inicial do ouro: $65.00/grama
- Custo total: ~0.00067 ETH (gás extremamente baixo)
- `.env.production.final` atualizado com endereços dos contratos
- **Patch aplicado**: `hardhat-ethers` v3.1.3 bug de `to: ""` em contract creation tx resolvido

---

> **GTK Team** — 2026
> "Lastreado em ouro, construído em código."
