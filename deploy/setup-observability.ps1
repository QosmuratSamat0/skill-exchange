#!/usr/bin/env pwsh
# Observability Stack Setup for PowerShell
# Run: .\deploy\setup-observability.ps1

Write-Host "╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Pairexx Observability Stack — PowerShell Setup          ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

$projectRoot = (Get-Location).Path
$prometheusConfig = Join-Path $projectRoot "deploy" "prometheus.yml"

# Validate config exists
if (-not (Test-Path $prometheusConfig)) {
    Write-Host "❌ Error: prometheus.yml not found at $prometheusConfig" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Configuration validated" -ForegroundColor Green
Write-Host ""

# Menu
Write-Host "Select operation:" -ForegroundColor Yellow
Write-Host "  1. Start Prometheus and Grafana"
Write-Host "  2. Stop containers"
Write-Host "  3. Clean up (remove containers)"
Write-Host "  4. View logs"
Write-Host "  5. Exit"
Write-Host ""

$choice = Read-Host "Enter choice (1-5)"

switch ($choice) {
    "1" {
        Write-Host ""
        Write-Host "Starting Prometheus..." -ForegroundColor Green
        docker run -d --name=prometheus -p 9090:9090 `
          -v "$prometheusConfig`:/etc/prometheus/prometheus.yml" `
          prom/prometheus --config.file=/etc/prometheus/prometheus.yml

        if ($LASTEXITCODE -eq 0) {
            Write-Host "✓ Prometheus started on http://localhost:9090" -ForegroundColor Green
        } else {
            Write-Host "⚠️  Prometheus may already be running" -ForegroundColor Yellow
        }

        Write-Host ""
        Write-Host "Starting Grafana..." -ForegroundColor Green
        docker run -d --name=grafana -p 3001:3000 grafana/grafana

        if ($LASTEXITCODE -eq 0) {
            Write-Host "✓ Grafana started on http://localhost:3001" -ForegroundColor Green
        } else {
            Write-Host "⚠️  Grafana may already be running" -ForegroundColor Yellow
        }

        Write-Host ""
        Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
        Write-Host "Observability Stack is running!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Next steps:" -ForegroundColor Yellow
        Write-Host "  1. Open http://localhost:3001 in your browser"
        Write-Host "  2. Login: admin / admin"
        Write-Host "  3. Add Prometheus data source:"
        Write-Host "     - Settings → Data Sources → Add Prometheus"
        Write-Host "     - URL: http://host.docker.internal:9090"
        Write-Host "     - Click 'Save & Test'"
        Write-Host "  4. Import dashboard:"
        Write-Host "     - + → Import Dashboard"
        Write-Host "     - Upload deploy\grafana-dashboard.json"
        Write-Host ""
        Write-Host "  Check metrics status:"
        Write-Host "  - Prometheus targets: http://localhost:9090/targets"
        Write-Host "  - Query builder: http://localhost:9090/graph"
        Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
        Write-Host ""
    }

    "2" {
        Write-Host "Stopping containers..." -ForegroundColor Yellow
        docker stop prometheus grafana 2> $null
        Write-Host "✓ Containers stopped" -ForegroundColor Green
    }

    "3" {
        Write-Host "Removing containers and volumes..." -ForegroundColor Yellow
        docker stop prometheus grafana 2> $null
        docker rm prometheus grafana 2> $null
        Write-Host "✓ Containers removed" -ForegroundColor Green
    }

    "4" {
        Write-Host "Prometheus logs:" -ForegroundColor Yellow
        docker logs prometheus --tail 20
        Write-Host ""
        Write-Host "Grafana logs:" -ForegroundColor Yellow
        docker logs grafana --tail 20
    }

    "5" {
        Write-Host "Exiting..." -ForegroundColor Yellow
        exit 0
    }

    default {
        Write-Host "Invalid choice" -ForegroundColor Red
        exit 1
    }
}
