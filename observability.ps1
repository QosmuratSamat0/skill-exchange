#!/usr/bin/env pwsh
# Observability Quick Start - One-Command Setup
# Usage: .\observability.ps1

Write-Host "`n╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Pairexx Observability - Quick Start                      ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

$projectRoot = (Get-Location).Path
$prometheusConfig = Join-Path $projectRoot "deploy" "prometheus.yml"

if (-not (Test-Path $prometheusConfig)) {
    Write-Host "ERROR: prometheus.yml not found!" -ForegroundColor Red
    exit 1
}

Write-Host "Project: $projectRoot" -ForegroundColor Gray
Write-Host "Config: $prometheusConfig`n" -ForegroundColor Gray

# Stop existing containers
Write-Host "Cleaning up existing containers..." -ForegroundColor Yellow
docker stop prometheus grafana 2>$null | Out-Null
docker rm prometheus grafana 2>$null | Out-Null

# Start Prometheus
Write-Host "`nStarting Prometheus..." -ForegroundColor Green
docker run -d --name=prometheus -p 9090:9090 `
  -v "$prometheusConfig`:/etc/prometheus/prometheus.yml" `
  prom/prometheus --config.file=/etc/prometheus/prometheus.yml | Out-Null

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Prometheus running on http://localhost:9090" -ForegroundColor Green
} else {
    Write-Host "✗ Failed to start Prometheus" -ForegroundColor Red
    exit 1
}

# Start Grafana
Write-Host "Starting Grafana..." -ForegroundColor Green
docker run -d --name=grafana -p 3001:3000 grafana/grafana | Out-Null

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Grafana running on http://localhost:3001" -ForegroundColor Green
} else {
    Write-Host "✗ Failed to start Grafana" -ForegroundColor Red
    exit 1
}

Write-Host "`n╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  SUCCESS - Observability Stack is Running                ║" -ForegroundColor Green
Write-Host "╚═══════════════════════════════════════════════════════════╝`n" -ForegroundColor Green

Write-Host "📊 Metrics Endpoints:" -ForegroundColor Yellow
Write-Host "   • Prometheus:  http://localhost:9090" -ForegroundColor Cyan
Write-Host "   • Grafana:     http://localhost:3001" -ForegroundColor Cyan
Write-Host ""

Write-Host "🚀 Next Steps:" -ForegroundColor Yellow
Write-Host "   1. Open http://localhost:3001 in your browser" -ForegroundColor White
Write-Host "   2. Login: admin / admin" -ForegroundColor White
Write-Host "   3. Add Prometheus datasource:" -ForegroundColor White
Write-Host "      - Settings → Data Sources → Add Prometheus" -ForegroundColor Gray
Write-Host "      - URL: http://host.docker.internal:9090" -ForegroundColor Gray
Write-Host "      - Save & Test" -ForegroundColor Gray
Write-Host "   4. Import dashboard:" -ForegroundColor White
Write-Host "      - + (Create) → Import Dashboard" -ForegroundColor Gray
Write-Host "      - Upload: deploy/grafana-dashboard.json" -ForegroundColor Gray
Write-Host ""

Write-Host "📈 View Metrics:" -ForegroundColor Yellow
Write-Host "   • Check targets: http://localhost:9090/targets" -ForegroundColor Cyan
Write-Host "   • Query metrics: http://localhost:9090/graph" -ForegroundColor Cyan
Write-Host ""

Write-Host "🛑 Stop Observability:" -ForegroundColor Yellow
Write-Host "   • PowerShell:  docker stop prometheus grafana" -ForegroundColor Cyan
Write-Host "   • Remove:      docker rm prometheus grafana" -ForegroundColor Cyan
Write-Host ""
