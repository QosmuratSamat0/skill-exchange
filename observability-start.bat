@echo off
REM Observability Stack Setup - Windows Batch File
REM Run this file: observability-start.bat

setlocal enabledelayedexpansion

echo.
echo =====================================================================
echo   Pairexx Observability Stack - Windows Setup
echo =====================================================================
echo.

set "PROJ=%cd%"
set "CONFIG=%PROJ%\deploy\prometheus.yml"

if not exist "%CONFIG%" (
    echo ERROR: prometheus.yml not found at %CONFIG%
    exit /b 1
)

echo Cleaning up existing containers...
docker stop prometheus grafana 2>nul >nul
docker rm prometheus grafana 2>nul >nul

echo.
echo Starting Prometheus...
docker run -d --name=prometheus -p 9090:9090 ^
  -v "%CONFIG%:/etc/prometheus/prometheus.yml" ^
  prom/prometheus --config.file=/etc/prometheus/prometheus.yml

if %errorlevel% equ 0 (
    echo OK - Prometheus running on http://localhost:9090
) else (
    echo FAILED - Check if Docker is running and port 9090 is available
    exit /b 1
)

echo.
echo Starting Grafana...
docker run -d --name=grafana -p 3001:3000 grafana/grafana

if %errorlevel% equ 0 (
    echo OK - Grafana running on http://localhost:3001
) else (
    echo FAILED - Check if port 3001 is available
    exit /b 1
)

echo.
echo =====================================================================
echo SUCCESS - Observability Stack is Running
echo =====================================================================
echo.

echo METRICS ENDPOINTS:
echo   - Prometheus:  http://localhost:9090
echo   - Grafana:     http://localhost:3001
echo.

echo NEXT STEPS:
echo   1. Open http://localhost:3001 in your browser
echo   2. Login: admin / admin
echo   3. Add Prometheus datasource:
echo      - Settings ^> Data Sources ^> Add Prometheus
echo      - URL: http://host.docker.internal:9090
echo      - Save and Test
echo   4. Import dashboard:
echo      - Create ^> Import Dashboard
echo      - Upload: deploy/grafana-dashboard.json
echo.

echo STOP OBSERVABILITY:
echo   docker stop prometheus grafana
echo.

endlocal
