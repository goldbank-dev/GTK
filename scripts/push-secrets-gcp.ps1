# GTK Bank — Envia secrets do .env.production.final para o GCP Secret Manager
# Uso: powershell -ExecutionPolicy Bypass -File scripts\push-secrets-gcp.ps1

$PROJECT = "gtk-bank-prod"
$ENV_FILE = "$PSScriptRoot\..\. env.production.final"
$ENV_FILE = Join-Path $PSScriptRoot "..\. env.production.final"
$ENV_FILE = (Resolve-Path (Join-Path $PSScriptRoot "..\.env.production.final")).Path

Write-Host "=== GTK Secret Manager Upload ===" -ForegroundColor Cyan
Write-Host "Projeto: $PROJECT"
Write-Host "Arquivo: $ENV_FILE`n"

# Ler e parsear o .env
$envVars = @{}
Get-Content $ENV_FILE | Where-Object { $_ -notmatch "^\s*#" -and $_ -match "=" } | ForEach-Object {
    $parts = $_ -split "=", 2
    if ($parts.Length -eq 2) {
        $envVars[$parts[0].Trim()] = $parts[1].Trim()
    }
}

# Mapa: nome no Secret Manager -> variável no .env
$secretMap = @{
    "gtk-deployer-private-key" = "DEPLOYER_PK"
    "gtk-bank-operator-key"    = "BANK_PRIVATE_KEY"
    "gtk-asaas-api-key"        = "ASAAS_API_KEY"
    "gtk-alchemy-mainnet-rpc"  = "MAINNET_RPC"
    "gtk-encryption-key"       = "ENCRYPTION_KEY"
    "gtk-jwt-secret"           = "JWT_SECRET"
    "gtk-api-key"              = "API_KEY"
}

$ok = 0
$fail = 0

foreach ($entry in $secretMap.GetEnumerator()) {
    $secretName = $entry.Key
    $envKey     = $entry.Value
    $value      = $envVars[$envKey]

    if (-not $value) {
        Write-Host "  SKIP $secretName (valor nao encontrado para $envKey)" -ForegroundColor Yellow
        $fail++
        continue
    }

    try {
        $value | gcloud secrets versions add $secretName --data-file=- --project=$PROJECT 2>&1 | Out-Null
        Write-Host "  OK   $secretName" -ForegroundColor Green
        $ok++
    } catch {
        Write-Host "  ERRO $secretName : $_" -ForegroundColor Red
        $fail++
    }
}

Write-Host "`nResultado: $ok enviados, $fail falhas" -ForegroundColor Cyan
