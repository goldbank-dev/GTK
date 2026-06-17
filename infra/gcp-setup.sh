#!/bin/bash
# GTK Bank — GCP Setup Script
# Execute PASSO A PASSO. Cada bloco é independente.
# Pré-requisito: gcloud CLI instalado e autenticado (gcloud auth login)

set -euo pipefail

PROJECT_ID="gtk-bank-prod"
REGION="southamerica-east1"
REGISTRY="${REGION}-docker.pkg.dev/${PROJECT_ID}/backend"
SQL_INSTANCE="gtk-bank-db"
SQL_DB="gtkbank"
SQL_USER="gtkapi"

echo "╔══════════════════════════════════════════════════╗"
echo "║     GTK Bank — GCP Infrastructure Setup         ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ─── PASSO 1: Projeto e Billing ──────────────────────────────────────────────
echo "▶ PASSO 1: Configurando projeto ${PROJECT_ID}..."
gcloud projects create ${PROJECT_ID} --name="GTK Bank Production" || true
gcloud config set project ${PROJECT_ID}
echo "  ⚠️  Acesse console.cloud.google.com e habilite o Billing para este projeto."
echo "  Pressione ENTER após habilitar o Billing..."
read -r

# ─── PASSO 2: Habilitar APIs ─────────────────────────────────────────────────
echo "▶ PASSO 2: Habilitando APIs..."
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  compute.googleapis.com \
  --project=${PROJECT_ID}
echo "  ✅ APIs habilitadas."

# ─── PASSO 3: Artifact Registry ──────────────────────────────────────────────
echo "▶ PASSO 3: Criando Artifact Registry..."
gcloud artifacts repositories create backend \
  --repository-format=docker \
  --location=${REGION} \
  --description="GTK Bank Docker images" \
  --project=${PROJECT_ID} || true
echo "  ✅ Registry: ${REGISTRY}"

# ─── PASSO 4: Secret Manager ─────────────────────────────────────────────────
echo "▶ PASSO 4: Criando secrets no Secret Manager..."
echo "  ⚠️  Você precisará preencher os valores depois."

SECRETS=(
  "gtk-deployer-private-key"
  "gtk-bank-operator-key"
  "gtk-asaas-api-key"
  "gtk-alchemy-mainnet-rpc"
  "gtk-encryption-key"
  "gtk-jwt-secret"
  "gtk-api-key"
  "goldbank-asaas-api-key"
  "goldbank-jwt-secret"
  "goldbank-encryption-key"
)

for SECRET in "${SECRETS[@]}"; do
  echo "placeholder" | gcloud secrets create ${SECRET} \
    --data-file=- \
    --project=${PROJECT_ID} \
    --replication-policy=automatic 2>/dev/null || \
  echo "placeholder" | gcloud secrets versions add ${SECRET} \
    --data-file=- \
    --project=${PROJECT_ID} 2>/dev/null || true
  echo "  ✅ Secret criado: ${SECRET}"
done

echo ""
echo "  ⚠️  AÇÃO NECESSÁRIA: Atualize os valores dos secrets acima no console:"
echo "  https://console.cloud.google.com/security/secret-manager?project=${PROJECT_ID}"
echo ""

# ─── PASSO 5: Cloud SQL ───────────────────────────────────────────────────────
echo "▶ PASSO 5: Criando instância Cloud SQL PostgreSQL 15..."
gcloud sql instances create ${SQL_INSTANCE} \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=${REGION} \
  --storage-type=SSD \
  --storage-size=10GB \
  --backup \
  --backup-start-time=03:00 \
  --no-assign-ip \
  --project=${PROJECT_ID} || true

echo "  ✅ Instância Cloud SQL criada."

gcloud sql databases create ${SQL_DB} \
  --instance=${SQL_INSTANCE} \
  --project=${PROJECT_ID} || true

SQL_PASSWORD=$(openssl rand -base64 32)
gcloud sql users create ${SQL_USER} \
  --instance=${SQL_INSTANCE} \
  --password="${SQL_PASSWORD}" \
  --project=${PROJECT_ID} || true

echo "  ✅ Database e usuário criados."
echo "  🔐 Senha do banco: ${SQL_PASSWORD}"
echo "  ⚠️  Salve esta senha no Secret Manager!"

# ─── PASSO 6: Build e Push das Imagens ──────────────────────────────────────
echo ""
echo "▶ PASSO 6: Build e Push das imagens Docker..."

# GTK API
gcloud builds submit \
  --tag="${REGISTRY}/gtk-api:latest" \
  --project=${PROJECT_ID} \
  ../../

echo "  ✅ gtk-api image pushed."

# GoldBank Server (goldbank-api v3.0 — C:\dev\goldbank-api)
gcloud builds submit \
  --tag="${REGISTRY}/goldbank-server:latest" \
  --project=${PROJECT_ID} \
  ../../../goldbank-api/

echo "  ✅ goldbank-server image pushed."

# ─── PASSO 7: Deploy no Cloud Run ────────────────────────────────────────────
echo ""
echo "▶ PASSO 7: Deploy no Cloud Run..."

# GTK API
gcloud run deploy gtk-api \
  --image="${REGISTRY}/gtk-api:latest" \
  --platform=managed \
  --region=${REGION} \
  --allow-unauthenticated \
  --min-instances=1 \
  --max-instances=10 \
  --memory=512Mi \
  --cpu=1 \
  --port=3000 \
  --set-secrets="DEPLOYER_PK=gtk-deployer-private-key:latest,ASAAS_API_KEY=gtk-asaas-api-key:latest,MAINNET_RPC=gtk-alchemy-mainnet-rpc:latest,API_KEY=gtk-api-key:latest" \
  --set-env-vars="NODE_ENV=production,NETWORK=mainnet" \
  --project=${PROJECT_ID} || true

# GoldBank Server
gcloud run deploy goldbank-server \
  --image="${REGISTRY}/goldbank-server:latest" \
  --platform=managed \
  --region=${REGION} \
  --allow-unauthenticated \
  --min-instances=1 \
  --max-instances=10 \
  --memory=256Mi \
  --cpu=1 \
  --port=8082 \
  --set-secrets="ASAAS_API_KEY=goldbank-asaas-api-key:latest,JWT_SECRET=goldbank-jwt-secret:latest,ENCRYPTION_KEY=goldbank-encryption-key:latest" \
  --set-env-vars="NODE_ENV=production" \
  --project=${PROJECT_ID} || true

echo ""
echo "  ✅ Deploy concluído!"
echo ""

# ─── PASSO 8: Domínios e SSL ─────────────────────────────────────────────────
echo "▶ PASSO 8: Mapeamento de domínios..."
echo "  ⚠️  Configure os DNS records no seu registrar apontando para o Load Balancer."
echo ""
echo "  Após o Load Balancer estar ativo, extraia o fingerprint SSL:"
echo ""
echo "  openssl s_client -connect api.gtk.bank:443 < /dev/null 2>/dev/null \\"
echo "    | openssl x509 -fingerprint -sha256 -noout"
echo ""
echo "  Adicione o hash no .env do mobile como EXPO_PUBLIC_SSL_FINGERPRINT"
echo ""

echo "╔══════════════════════════════════════════════════╗"
echo "║            SETUP GCP CONCLUÍDO! ✅              ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "Próximos passos manuais:"
echo "  1. Preencher secrets no Secret Manager"
echo "  2. Configurar DNS para api.gtk.bank e goldbank.api.gtk.bank"
echo "  3. Aplicar schema SQL: psql -h ... -U ${SQL_USER} -d ${SQL_DB} -f cloud-sql-schema.sql"
echo "  4. Extrair fingerprint SSL após DNS propagação"
