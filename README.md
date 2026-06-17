# GTK (Gold Token)

Token ERC-20 upgradeable lastreado 1:1 em ouro físico (1 GTK = 1g ouro 99.99%).

## Quick Start

```bash
# Instalar dependências
npm install

# Compilar contratos
npm run compile

# Testar contratos Solidity
npm test

# Deploy na Sepolia
npm run deploy:sepolia

# Verificar contratos no Etherscan
npm run verify
```

## API

```bash
# Iniciar API em produção
npm run start

# Iniciar API em dev (com nodemon)
npm run dev

# Iniciar API em staging
npm run start:staging

# Iniciar API em produção
npm run start:prod
```

## Testes

```bash
# Testes de contratos Solidity
npm test
npm run test:unit

# Testes de API (com mocks)
npm run test:api

# Testes do Dashboard (snapshot/responsivo)
npm run test:dashboard

# Testes de fluxo crítico E2E
npm run test:e2e

# Rodar todos os testes
npm run test:all
```

## Environments

| File | Ambiente | Uso |
|------|----------|-----|
| `.env` | Desenvolvimento local | Cópia de `.env.example` com credenciais reais |
| `.env.staging` | Staging (Sepolia) | Testes em testnet com Asaas sandbox |
| `.env.production` | Produção (Mainnet) | Mainnet real com Asaas produção |

```bash
# Setup rápido
copy .env.staging .env
# ou
copy .env.example .env
```

## Deploy

```bash
# Sepolia (testnet)
npm run deploy:sepolia

# Mainnet (produção)
npm run deploy:mainnet

# Gas report
npm run gas

# Cobertura de testes
npm run coverage
```

## Contratos (Sepolia)

| Contrato | Endereço |
|----------|----------|
| **GTKPriceOracle** | `0x8DA918381c9feC2a84F53a6ba07F9fA83E8FbD3d` |
| **GTKToken** (UUPS proxy) | `0x646C3a2A1D4A782Ce464c2Ddf0667aCcD689C2F5` |
| **GTKBank** (UUPS proxy) | `0x938089e3C2514A088b26C6b813e51f3c1D0296dE` |

## Estrutura do Projeto

```
GTK/
├── contracts/           # Contratos Solidity
│   ├── token/           # GTKToken (ERC-20 upgradeable)
│   ├── bank/            # GTKBank (depósito/saque PIX)
│   ├── oracle/          # GTKPriceOracle (Chainlink + fallback)
│   ├── governance/      # GTKGovernance (DAO)
│   └── interfaces/      # IGTKToken
├── src/
│   ├── api/             # API Express modular
│   │   ├── config/      # Config e blockchain
│   │   ├── routes/      # Rotas REST
│   │   ├── services/    # Lógica de negócio
│   │   ├── middleware/   # Auth, KYC, error handler
│   │   ├── cron/        # Price updater
│   │   └── utils/       # Logger
│   ├── client/          # API client (frontend)
│   └── dashboard/       # Dashboard React
├── tests/
│   ├── unit/            # Testes de contratos (Hardhat)
│   ├── api/             # Testes de API (Jest + Supertest)
│   ├── dashboard/       # Testes de UI (Jest + RTL)
│   └── e2e/             # Testes de fluxo crítico
├── scripts/             # Scripts de deploy e interação
├── docs/                # Documentação
├── MEMORIA.md           # Memória completa do projeto
└── README.md            # Este arquivo
```

## Rotas da API

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/health` | Healthcheck |
| GET | `/api/v1/system/info` | Informações do sistema |
| GET | `/api/v1/balance/:address` | Saldo GTK/USDT |
| POST | `/api/v1/deposit/pix/create` | Criar PIX para depósito |
| POST | `/api/v1/deposit/pix/webhook` | Webhook de confirmação PIX |
| GET | `/api/v1/deposit/pix/:pixId/status` | Status do depósito |
| POST | `/api/v1/withdrawal/pix` | Solicitar saque PIX |
| GET | `/api/v1/kyc/:address` | Status KYC |
| POST | `/api/v1/kyc/register` | Registrar KYC (Asaas) |
| POST | `/api/v1/kyc/webhook` | Webhook Asaas KYC |

---

**GTK Team © 2026** — "Lastreado em ouro, construído em código."
