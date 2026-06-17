-- GTK Bank — Cloud SQL PostgreSQL 15 Schema
-- Migração do db.json + tabelas GTK
-- Região: southamerica-east1 (São Paulo)

-- ─── GOLDBANK MOBILE ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id                  VARCHAR(64) PRIMARY KEY,  -- Asaas customer ID (cus_xxxx)
  name                VARCHAR(255) NOT NULL,
  email               VARCHAR(255) UNIQUE NOT NULL,
  token               TEXT,
  token_expires_at    TIMESTAMPTZ,
  asaas_status        VARCHAR(32) DEFAULT 'PENDING',
  wallet_id           VARCHAR(64),
  wallet_address      VARCHAR(42),              -- Ethereum address para GTK
  mb_credentials      JSONB,                    -- { data: hex, iv: hex } AES-256
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  id                  VARCHAR(64) PRIMARY KEY,
  user_id             VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
  type                VARCHAR(16) NOT NULL,     -- INFLOW | OUTFLOW
  category            VARCHAR(64),
  amount_brl          NUMERIC(18, 2),
  amount_gtk          NUMERIC(36, 18),          -- GTK tokens (18 decimais)
  description         TEXT,
  status              VARCHAR(16) DEFAULT 'PENDING',
  asaas_charge_id     VARCHAR(64),
  tx_hash             VARCHAR(66),              -- Ethereum tx hash
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status  ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_users_email           ON users(email);

-- ─── GTK DEPOSITS (PIX → Mint) ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gtk_deposits (
  id              SERIAL PRIMARY KEY,
  pix_id          VARCHAR(64) UNIQUE NOT NULL,  -- ID do pagamento Asaas
  user_address    VARCHAR(42) NOT NULL,
  user_id         VARCHAR(64) REFERENCES users(id),
  amount_brl      NUMERIC(18, 2) NOT NULL,
  amount_gtk      NUMERIC(36, 18),
  gold_grams      NUMERIC(18, 8),
  status          VARCHAR(16) DEFAULT 'PENDING', -- PENDING | CONFIRMED | MINTED | FAILED
  mint_tx_hash    VARCHAR(66),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gtk_deposits_address ON gtk_deposits(user_address);
CREATE INDEX IF NOT EXISTS idx_gtk_deposits_status  ON gtk_deposits(status);

-- ─── GTK WITHDRAWALS (Burn → PIX) ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gtk_withdrawals (
  id              SERIAL PRIMARY KEY,
  user_address    VARCHAR(42) NOT NULL,
  user_id         VARCHAR(64) REFERENCES users(id),
  amount_gtk      NUMERIC(36, 18) NOT NULL,
  amount_brl      NUMERIC(18, 2),
  gold_grams      NUMERIC(18, 8),
  pix_key         VARCHAR(255),
  status          VARCHAR(16) DEFAULT 'PENDING',
  burn_tx_hash    VARCHAR(66),
  pix_payment_id  VARCHAR(64),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── GTK REDEMPTIONS (Resgate Físico) ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gtk_redemptions (
  id                SERIAL PRIMARY KEY,
  request_id        VARCHAR(66) UNIQUE,  -- bytes32 do contrato
  user_address      VARCHAR(42) NOT NULL,
  amount_gtk        NUMERIC(36, 18) NOT NULL,
  gold_grams        NUMERIC(18, 8),
  delivery_address  TEXT,
  status            VARCHAR(16) DEFAULT 'PENDING',
  burn_tx_hash      VARCHAR(66),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ─── GTK GOLD BARS (Custódia) ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gold_bars (
  serial          VARCHAR(64) PRIMARY KEY,
  weight_grams    NUMERIC(18, 4) NOT NULL,
  purity          INTEGER NOT NULL,  -- ex: 9999 = 99.99%
  vault           VARCHAR(128),
  status          VARCHAR(16) DEFAULT 'ACTIVE',
  deposit_tx_hash VARCHAR(66),
  audited_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── SISTEMA ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS price_history (
  id              SERIAL PRIMARY KEY,
  gold_price_usd  NUMERIC(18, 8) NOT NULL,   -- preço por grama em USD
  gold_price_brl  NUMERIC(18, 8),
  source          VARCHAR(64),              -- 'chainlink' | 'metals-api' | 'manual'
  recorded_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_history_time ON price_history(recorded_at DESC);

-- ─── TRIGGERS updated_at ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at         BEFORE UPDATE ON users         FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_gtk_deposits_updated_at  BEFORE UPDATE ON gtk_deposits  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_gtk_withdrawals_updated  BEFORE UPDATE ON gtk_withdrawals FOR EACH ROW EXECUTE FUNCTION update_updated_at();
