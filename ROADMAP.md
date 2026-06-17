# GTK (Gold Token) — Roadmap de Lançamento
> Data prevista: Segunda-feira, 18 de Maio de 2026
> Atualizado: 18/05/2026 — Fusão GTK + GoldBank Mobile + GCP + Fingerprint

## 🎯 Objetivo
Deploy oficial na Ethereum Mainnet, fusão completa com GoldBank Mobile, infraestrutura produtiva na Google Cloud Platform e blindagem de segurança Fingerprint.

---

## 📅 Cronograma do Dia (Segunda-feira, 18/05)

---

### 🔐 FASE 0: Segurança de Base (Primeiras horas — BLOQUEANTE)
> Nada vai para produção sem isso estar travado.

- [ ] **Gerar NOVAS wallets de produção** — Deployer + Operador (NUNCA reutilizar as de testnet)
- [ ] **Salvar mnemônicas offline** — Papel, cofre físico. Nunca em cloud não criptografado.
- [ ] **Transferir ETH real** — Estimar 0.15–0.20 ETH para deploy + verificação na Mainnet
- [ ] **Configurar `.env.production`**:
  - RPC Mainnet (Alchemy)
  - Novas chaves privadas
  - Chaves Asaas de produção
  - Encryption key AES-256 nova (256-bit random)

---

### ☁️ FASE 1: Setup da Google Cloud Platform (Manhã)

#### 1.1 Projeto e IAM
- [ ] Criar Projeto GCP: `gtk-bank-prod`
- [ ] Habilitar Billing Account
- [ ] Habilitar APIs: Cloud Run, Cloud SQL, Secret Manager, Artifact Registry, Load Balancing, Cloud Build

#### 1.2 Google Secret Manager — Cofre de Chaves
> **Nenhuma chave sensível no `.env` de produção — tudo no Secret Manager.**

```
# Secrets a criar:
gtk/deployer-private-key
gtk/bank-operator-key
gtk/asaas-api-key-prod
gtk/alchemy-mainnet-rpc
gtk/encryption-key-aes256
gtk/jwt-secret
gtk/fingerprint-secret
goldbank/asaas-api-key
goldbank/mb-encryption-key
```

- [ ] Criar todos os secrets acima no Secret Manager
- [ ] Configurar Service Account com permissão `secretmanager.secretAccessor`
- [ ] Atualizar código dos servidores para ler via `@google-cloud/secret-manager` em vez de `process.env`

#### 1.3 Cloud SQL — Banco de Dados Gerenciado
> Migrar o `db.json` do server-goldbank e logs da GTK API para PostgreSQL gerenciado.

- [ ] Criar instância Cloud SQL PostgreSQL 15 (região: `southamerica-east1` — São Paulo)
- [ ] Definir schema inicial:
  ```sql
  -- Migração do db.json do server-goldbank
  CREATE TABLE users (id, name, email, token, status, asaas_customer_id, wallet_address, created_at);
  CREATE TABLE transactions (id, user_id, type, amount_brl, amount_gtk, status, asaas_charge_id, tx_hash, created_at);
  CREATE TABLE gtk_deposits (id, user_address, pix_id, amount_brl, amount_gtk, status, mint_tx_hash, created_at);
  CREATE TABLE gtk_redemptions (id, user_address, amount_gtk, delivery_address, status, created_at);
  ```
- [ ] Configurar backups automáticos diários
- [ ] Habilitar Cloud SQL Auth Proxy para conexão segura sem IP público exposto

#### 1.4 Artifact Registry — Imagens Docker
- [ ] Criar repositório Docker: `southamerica-east1-docker.pkg.dev/gtk-bank-prod/backend`
- [ ] Criar `Dockerfile` para GTK API (ver abaixo)
- [ ] Criar `Dockerfile` para server-goldbank atualizado

**Dockerfile GTK API:**
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src/ ./src/
EXPOSE 3000
CMD ["node", "src/server.js"]
```

**Dockerfile server-goldbank:**
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY serve.js ./
COPY db.json ./
EXPOSE 8082
CMD ["node", "serve.js"]
```

#### 1.5 Cloud Run — Deploy dos Serviços
- [ ] Deploy **GTK API** no Cloud Run:
  - Região: `southamerica-east1`
  - Min instances: 1, Max: 10 (auto-scaling)
  - RAM: 512Mi, CPU: 1
  - Variáveis de ambiente lidas do Secret Manager
  - URL: `https://gtk-api-HASH-uc.a.run.app` (temporária, depois CNAME)

- [ ] Deploy **server-goldbank** no Cloud Run:
  - Mesmo padrão acima
  - URL: `https://goldbank-api-HASH-uc.a.run.app`

#### 1.6 Cloud Load Balancing + SSL
- [ ] Criar Cloud Load Balancer com HTTPS
- [ ] Provisionar certificados SSL gerenciados (Google-managed):
  - `api.gtk.bank` → GTK API (Cloud Run)
  - `goldbank.api.gtk.bank` → server-goldbank (Cloud Run)
  - `app.gtk.bank` → Dashboard React (Cloud Run ou Cloud Storage)
- [ ] **Extrair SHA-256 Fingerprint do certificado SSL:**
  ```bash
  # Após provisionar o certificado:
  openssl s_client -connect api.gtk.bank:443 < /dev/null 2>/dev/null \
    | openssl x509 -fingerprint -sha256 -noout
  # Exemplo: SHA256 Fingerprint=AA:BB:CC:DD:...
  ```
  > ⚠️ Guardar esse hash — será usado no SSL Pinning do app mobile.

---

### ⛓️ FASE 2: Deploy dos Contratos na Mainnet (Meio-dia)

- [ ] Confirmar preço do gás (alvo: < 20 gwei)
- [ ] Executar Slither + Mythril — último scan antes do deploy real
- [ ] `npx hardhat run scripts/deploy/mainnet-deploy.ts --network mainnet`
  - Deploy GTKPriceOracle (Chainlink XAU/USD mainnet: `0x214eD9Da11D2fbe465a6fc601a91E62EbEc1a0D6`)
  - Deploy GTKToken (UUPS Proxy)
  - Deploy GTKBank (UUPS Proxy)
- [ ] Verificar contratos no Etherscan mainnet
- [ ] Atualizar `.env.production` com endereços definitivos
- [ ] Atualizar Secret Manager com novos endereços

---

### 🔌 FASE 3: Fusão GTK + GoldBank Mobile (Tarde)

#### 3.1 Atualizar server-goldbank (ver FASE 4 — Fingerprint)
O server-goldbank precisa de atualizações críticas ANTES de se conectar ao GTK.

#### 3.2 Novos endpoints no server-goldbank para GTK
Adicionar ao `serve.js` (ou novo arquivo `routes/gtk.js`):

```javascript
// Proxy/integração com GTK API
GET  /api/gtk/balance/:address    → proxy para GTK API /api/v1/balance/:address
POST /api/gtk/deposit/pix/create  → proxy para GTK API /api/v1/deposit/pix/create
GET  /api/gtk/price               → proxy para GTK API /api/v1/system/info
POST /api/gtk/withdraw            → proxy para GTK API /api/v1/withdrawal/pix
```

#### 3.3 Mobile — Componentes a modificar

**A. `app/(tabs)/wallet.tsx` (WalletCard)**
- Adicionar chamada ao novo `GET /api/gtk/balance/:address`
- Exibir saldo em BRL + saldo em GTK (gramas de ouro)
- Saldo GTK = `balance * goldPricePerGram` convertido para BRL

**B. `app/(tabs)/wallet.tsx` (DepositPIX)**
- Substituir chamada mock por `POST /api/gtk/deposit/pix/create`
- Parâmetros: `{ amountBRL, userAddress, pixKey }`
- Após confirmação: mostrar "Ouro creditado!" + novo saldo GTK em tempo real

**C. `app/(tabs)/crypto.tsx`**
- Adicionar GTK como primeiro ativo na lista (destaque)
- Botão "Converter para Ouro" → chama `POST /api/gtk/deposit/pix/create`
- Preço GTK = preço dinâmico do oráculo (não mockado)

**D. `services/api.ts` — Atualizar base URL**
```typescript
// De: http://localhost:8082
// Para: https://goldbank.api.gtk.bank  (produção)
//    ou https://goldbank-api-HASH.run.app (staging)
```

#### 3.4 ethers.js no React Native
Para suporte a assinatura de transações de resgate no app:
```bash
npm install ethers react-native-get-random-values buffer
```
- Adicionar `import 'react-native-get-random-values'` no entry point `app/_layout.tsx`
- Criar `hooks/useGTKWallet.ts` — hook para saldo, mint e burn

---

### 🛡️ FASE 4: Fingerprint & Security Lockdown (Crítico)

#### 4.1 Correções Urgentes no server-goldbank

**PROBLEMA 1 — CORS permissivo (`*`)**
```javascript
// ATUAL (vulnerável):
res.setHeader('Access-Control-Allow-Origin', '*')

// CORRIGIR PARA:
const ALLOWED_ORIGINS = [
  'https://app.gtk.bank',
  'https://goldbank.app',  // seu domínio do app (web)
  'http://localhost:8081', // dev Expo
  'exp://localhost:8081',  // dev Expo
]
const origin = req.headers['origin']
if (ALLOWED_ORIGINS.includes(origin)) {
  res.setHeader('Access-Control-Allow-Origin', origin)
}
```

**PROBLEMA 2 — Token sem expiração**
```javascript
// ATUAL (vulnerável):
const token = crypto.randomBytes(32).toString('hex')
// Sem expiração — token vale para sempre

// CORRIGIR: Migrar para JWT com expiração
const jwt = require('jsonwebtoken')
const token = jwt.sign(
  { userId: user.id, email: user.email },
  process.env.JWT_SECRET,  // do Secret Manager
  { expiresIn: '7d' }
)
```

**PROBLEMA 3 — Sem Rate Limiting**
```javascript
// ADICIONAR:
const rateLimit = require('express-rate-limit')
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100,                   // 100 req por IP
  message: { error: 'Too many requests' }
})
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // 5 tentativas de login
  message: { error: 'Too many login attempts' }
})
app.use(limiter)
app.use('/api/auth/login', loginLimiter)
```

**PROBLEMA 4 — db.json em produção (sem persistência real)**
- Migrar para Cloud SQL conforme FASE 1.3
- Adicionar `pg` (node-postgres) como driver

**PROBLEMA 5 — Sem HTTPS enforcement**
- No Cloud Run, o Load Balancer já serve HTTPS
- Adicionar middleware de redirect HTTP→HTTPS no servidor para local dev:
```javascript
if (process.env.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] !== 'https') {
  return res.redirect(301, `https://${req.headers.host}${req.url}`)
}
```

#### 4.2 SSL Pinning no App Mobile

No `services/api.ts` do goldbank-mobile, implementar certificate pinning:
```typescript
// services/api.ts
import axios from 'axios'

// SHA-256 do certificado SSL da GCP (extraído na FASE 1.6)
// Exemplo: 'sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
const CERT_FINGERPRINT = process.env.EXPO_PUBLIC_SSL_FINGERPRINT

const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    'X-App-Version': '1.0.0',
  }
})

// Interceptor de segurança — adiciona timestamp anti-replay
api.interceptors.request.use(config => {
  config.headers['X-Request-Timestamp'] = Date.now().toString()
  config.headers['X-App-Platform'] = Platform.OS
  return config
})
```

Para o SSL Pinning real no React Native (nativo):
- Android: `network_security_config.xml` com `<pin digest="SHA-256">HASH</pin>`
- iOS: `Info.plist` + `NSAppTransportSecurity` + pinning via custom `URLSessionDelegate`

#### 4.3 App Integrity (Anti-Tampering)

**Android — Play Integrity API:**
```typescript
// hooks/useDeviceIntegrity.ts
import { getIntegrityToken } from 'react-native-play-integrity'

export async function checkDeviceIntegrity(): Promise<boolean> {
  try {
    const token = await getIntegrityToken(NONCE)
    // Enviar token para o backend para verificação server-side
    const result = await api.post('/api/security/verify-integrity', { token })
    return result.data.isValid
  } catch {
    return false  // Bloquear operações sensíveis
  }
}
```

**Backend (server-goldbank) — Endpoint de verificação:**
```javascript
POST /api/security/verify-integrity
// Verifica Play Integrity token (Google) ou App Attest (Apple)
// Rejeita se: deviceRecognitionVerdict != 'MEETS_DEVICE_INTEGRITY'
// Rejeita se: appIntegrityVerdict != 'PLAYS_RECOGNIZED'
```

#### 4.4 Backend — Validação de Fingerprint de Requisição

Adicionar ao server-goldbank para operações financeiras (depósito/saque):
```javascript
// middleware/requestFingerprint.js
function validateRequestFingerprint(req, res, next) {
  const timestamp = parseInt(req.headers['x-request-timestamp'] || '0')
  const now = Date.now()
  
  // Rejeitar requisições com mais de 5 minutos (anti-replay)
  if (Math.abs(now - timestamp) > 5 * 60 * 1000) {
    return res.status(401).json({ error: 'Request expired' })
  }
  
  // Verificar que a plataforma é mobile (não Postman/curl em prod)
  const platform = req.headers['x-app-platform']
  if (process.env.NODE_ENV === 'production' && !['ios', 'android'].includes(platform)) {
    return res.status(403).json({ error: 'Access denied' })
  }
  
  next()
}
```

---

### 🆔 FASE 5: Identidade e Branding (Tarde/Noite)

- [ ] Upload do `icon.png` no Etherscan (Token Info)
- [ ] Adicionar links sociais e site no Etherscan
- [ ] MetaMask Asset Registry — PR com ícone do GTK
- [ ] Configurar domínios: `app.gtk.bank`, `api.gtk.bank`

---

### 🥇 FASE 6: Custódia e Ativação (Noite)

- [ ] Registrar primeira barra de ouro no contrato: `depositGold("BR-001", 50000, 9999, "BRINCS-SP")`
- [ ] Ativar cron de atualização de preço (15 min)
- [ ] Mint inicial de GTK para liquidez (proporcional ao ouro físico registrado)
- [ ] Lançamento público — liberar Dashboard + App

---

## 🛠️ Stack Tecnológica Final

| Camada | Tecnologia |
|--------|-----------|
| Blockchain | Ethereum Mainnet (Solidity 0.8.20, UUPS) |
| Smart Contract Backend | Node.js 20 + Express + ethers.js v6 |
| Mobile Backend | Node.js 20 (server-goldbank — atualizado) |
| Mobile App | React Native 0.81 + Expo SDK 54 |
| Frontend Web | React 19 + Vite |
| Banco de Dados | Cloud SQL PostgreSQL 15 (GCP) |
| Infraestrutura | GCP Cloud Run + Load Balancer + Secret Manager |
| Pagamentos | Asaas (PIX) |
| Oracle | Chainlink XAU/USD + Metals-API |
| Segurança | SSL Pinning + Play Integrity + App Attest + JWT |

---

## ⚠️ Pontos de Atenção

1. **Gas Fees**: Deploy na Mainnet em horário de baixo tráfego (< 20 gwei). Monitorar em etherscan.io/gastracker.
2. **db.json → Cloud SQL**: server-goldbank em prod NÃO pode usar arquivo local. Migração é obrigatória.
3. **CORS `*`**: Vulnerabilidade crítica no server-goldbank — corrigir ANTES de qualquer exposição pública.
4. **JWT sem expiração**: Token atual (`randomBytes(32).toString('hex')`) nunca expira. Migrar para JWT obrigatório.
5. **Chaves Asaas em produção**: O MEMORIA.md do mobile indica que a chave já está apontando para `$aact_prod_`. Mover para Secret Manager imediatamente.
6. **SSL Fingerprint**: Só extrair após o certificado GCP estar provisionado e estável. Não hardcodar certificados de staging no build de produção.
7. **Security Audit**: Rodar Slither e Mythril nos contratos ANTES do deploy mainnet.

---

## 📦 Dependências a Instalar

**server-goldbank:**
```bash
npm install express-rate-limit jsonwebtoken helmet @google-cloud/secret-manager pg
```

**goldbank-mobile:**
```bash
npm install ethers react-native-get-random-values buffer react-native-play-integrity
```

**GTK API (C:\dev\GTK):**
```bash
npm install @google-cloud/secret-manager pg
```

---

*GTK Team - 2026 | "Lastreado em ouro, construído em código."*
