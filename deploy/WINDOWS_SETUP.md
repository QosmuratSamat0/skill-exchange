# Windows Setup Guide - Observability Stack

## Problem: PowerShell Syntax Issue

The bash/bash commands use backslash `\` for line continuation, but PowerShell uses backtick `` ` ``.

**What failed:**
```powershell
# ❌ WRONG - bash syntax in PowerShell
docker run -d --name=prometheus -p 9090:9090 \
  -v $(pwd)/deploy/prometheus.yml:/etc/prometheus/prometheus.yml \
  prom/prometheus
```

## Solution: Use Provided Scripts

### Option 1: PowerShell (Recommended for Windows)

```powershell
# Start the interactive setup
.\deploy\setup-observability.ps1

# Or use Make if you have GNU Make installed
make observability-start
```

**Features:**
- ✅ Interactive menu
- ✅ Automatic path handling
- ✅ Color-coded output
- ✅ Error checking

### Option 2: Windows CMD

```cmd
REM Start the interactive setup
deploy\setup-observability.bat

REM Or direct commands:
docker run -d --name=prometheus -p 9090:9090 ^
  -v "%CD%\deploy\prometheus.yml:/etc/prometheus/prometheus.yml" ^
  prom/prometheus --config.file=/etc/prometheus/prometheus.yml

docker run -d --name=grafana -p 3001:3000 grafana/grafana
```

**Key differences from bash:**
- Use `^` for line continuation (not `\`)
- Use `%CD%` for current directory (not `$(pwd)`)
- Use `"` for paths with spaces

### Option 3: Make Commands (if GNU Make installed)

```bash
make observability-start   # Start Prometheus + Grafana
make observability-stop    # Stop containers
make observability-clean   # Remove containers
make observability-docs    # View documentation
```

## Step-by-Step: Using setup-observability.ps1

### 1. Open PowerShell
```powershell
# Right-click Start menu → Windows PowerShell (Admin)
# OR press Win+X → A
```

### 2. Navigate to project
```powershell
cd C:\Users\bauka\Desktop\Pairexx
```

### 3. Allow script execution (first time only)
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### 4. Run setup script
```powershell
.\deploy\setup-observability.ps1
```

### 5. Select option 1 (Start containers)
```
Select operation:
  1. Start Prometheus and Grafana    <-- Choose this
  2. Stop containers
  3. Clean up (remove containers)
  4. View logs
  5. Exit

Enter choice (1-5): 1
```

### 6. Wait for output
```
✓ Prometheus started on http://localhost:9090
✓ Grafana started on http://localhost:3001

Next steps:
  1. Open http://localhost:3001 in your browser
  2. Login: admin / admin
  ...
```

## Direct Command: Corrected PowerShell

If you want to run commands directly in PowerShell:

```powershell
# Get current directory properly
$projDir = Get-Location

# Start Prometheus (corrected syntax)
docker run -d --name=prometheus -p 9090:9090 `
  -v "$projDir\deploy\prometheus.yml:/etc/prometheus/prometheus.yml" `
  prom/prometheus --config.file=/etc/prometheus/prometheus.yml

# Start Grafana
docker run -d --name=grafana -p 3001:3000 grafana/grafana

# Verify they're running
docker ps | Select-String "prometheus|grafana"

# View logs if needed
docker logs prometheus
docker logs grafana
```

## Direct Command: Corrected CMD

For Windows Command Prompt:

```cmd
REM Store path as variable
set PROJ=%CD%

REM Start Prometheus (note the ^ continuation character)
docker run -d --name=prometheus -p 9090:9090 ^
  -v "%PROJ%\deploy\prometheus.yml:/etc/prometheus/prometheus.yml" ^
  prom/prometheus --config.file=/etc/prometheus/prometheus.yml

REM Start Grafana
docker run -d --name=grafana -p 3001:3000 grafana/grafana

REM Check status
docker ps | find "prometheus"
docker ps | find "grafana"
```

## Troubleshooting

### "Container name already exists"
```powershell
# Stop and remove existing containers
docker stop prometheus grafana
docker rm prometheus grafana

# Then run setup script again
.\deploy\setup-observability.ps1
```

### "Port 9090 already in use"
```powershell
# Find what's using the port
Get-NetTCPConnection -LocalPort 9090

# Or use different port
docker run -d --name=prometheus -p 9091:9090 `
  -v "...\prometheus.yml:/etc/prometheus/prometheus.yml" `
  prom/prometheus
```

### "Cannot connect to Grafana at localhost:3001"
```powershell
# Check if Grafana container is running
docker ps | findstr "grafana"

# Check logs
docker logs grafana --tail 50

# Restart
docker restart grafana
```

## After Containers Start

### Import Grafana Dashboard

1. Open http://localhost:3001
2. Click **+ (Create)** → **Import Dashboard**
3. Upload file: `deploy/grafana-dashboard.json`
4. Select data source: **Prometheus** (http://host.docker.internal:9090)
5. Click **Import**

### View Metrics

- **Prometheus**: http://localhost:9090
  - Check targets: **Status > Targets** (should all show "UP")
  - Query builder: **Graph** tab
  
- **Grafana**: http://localhost:3001
  - View dashboard with live metrics
  - Refresh every 5 seconds

## File Reference

| File | Purpose |
|------|---------|
| `deploy/setup-observability.ps1` | **PowerShell interactive setup** ← Use this |
| `deploy/setup-observability.bat` | CMD batch interactive setup |
| `deploy/prometheus.yml` | Prometheus config |
| `deploy/grafana-dashboard.json` | Importable dashboard |
| `deploy/OBSERVABILITY.md` | Full documentation |
| `Makefile` | Make targets (if installed) |

## Next Time

Future startups:

```powershell
# Quick start
.\deploy\setup-observability.ps1  # Choose option 1

# Or one-liner (after first setup)
docker start prometheus grafana
```

## Summary

**For Windows users:**
- ✅ Use `.\deploy\setup-observability.ps1` (easiest)
- ✅ Or use `make observability-start` (if Make installed)
- ❌ Don't copy bash commands directly (syntax is different)

**The key differences:**
- Bash: `\` continuation + `$(pwd)` for path
- PowerShell: `` ` `` continuation + `$projDir` for path
- CMD: `^` continuation + `%CD%` for path
