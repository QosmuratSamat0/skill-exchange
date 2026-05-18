@echo off
REM Observability Stack Setup for Windows CMD
REM Run: deploy\setup-observability.bat

setlocal enabledelayedexpansion

echo.
echo ============================================================
echo   Pairexx Observability Stack - Windows CMD Setup
echo ============================================================
echo.

set "PROMETHEUS_CONFIG=%CD%\deploy\prometheus.yml"

if not exist "%PROMETHEUS_CONFIG%" (
    echo Error: prometheus.yml not found at %PROMETHEUS_CONFIG%
    exit /b 1
)

echo Configuration validated
echo.
echo Select operation:
echo   1. Start Prometheus and Grafana
echo   2. Stop containers
echo   3. Clean up (remove containers)
echo   4. View logs
echo   5. Exit
echo.

set /p choice="Enter choice (1-5): "

if "%choice%"=="1" goto start
if "%choice%"=="2" goto stop
if "%choice%"=="3" goto clean
if "%choice%"=="4" goto logs
if "%choice%"=="5" goto exit
goto invalid

:start
echo.
echo Starting Prometheus...
docker run -d --name=prometheus -p 9090:9090 ^
  -v "%PROMETHEUS_CONFIG%:/etc/prometheus/prometheus.yml" ^
  prom/prometheus --config.file=/etc/prometheus/prometheus.yml

if %errorlevel% equ 0 (
    echo [OK] Prometheus started on http://localhost:9090
) else (
    echo [WARNING] Prometheus may already be running
)

echo.
echo Starting Grafana...
docker run -d --name=grafana -p 3001:3000 grafana/grafana

if %errorlevel% equ 0 (
    echo [OK] Grafana started on http://localhost:3001
) else (
    echo [WARNING] Grafana may already be running
)

echo.
echo ============================================================
echo Observability Stack is running!
echo.
echo Next steps:
echo   1. Open http://localhost:3001 in your browser
echo   2. Login: admin / admin
echo   3. Add Prometheus data source:
echo      - Settings ^> Data Sources ^> Add Prometheus
echo      - URL: http://host.docker.internal:9090
echo      - Click 'Save ^& Test'
echo   4. Import dashboard:
echo      - + ^> Import Dashboard
echo      - Upload deploy\grafana-dashboard.json
echo.
echo Metrics endpoints:
echo   - API Gateway:        http://localhost:8080/metrics
echo   - User Service:       http://localhost:8081/metrics
echo   - Matchmaking Service: http://localhost:8082/metrics
echo   - Prometheus:         http://localhost:9090
echo   - Grafana:            http://localhost:3001
echo ============================================================
echo.
goto end

:stop
echo Stopping containers...
docker stop prometheus grafana 2>nul
echo [OK] Containers stopped
goto end

:clean
echo Removing containers...
docker stop prometheus grafana 2>nul
docker rm prometheus grafana 2>nul
echo [OK] Containers removed
goto end

:logs
echo Prometheus logs:
docker logs prometheus --tail 20
echo.
echo Grafana logs:
docker logs grafana --tail 20
goto end

:invalid
echo Invalid choice
exit /b 1

:end
endlocal
exit /b 0
