# Pairexx Observability Pipeline - Complete Setup Guide

This guide walks through the complete observability implementation for the Pairexx microservices platform, including Prometheus metrics collection, Grafana visualization, and service instrumentation.

## Architecture Overview

```
Services (Expose /metrics)
  ├─ api-gateway:8080/metrics
  ├─ user-service:8081/metrics
  └─ matchmaking-service:8082/metrics
        │
        ▼
    Prometheus:9090 (scrapes every 5s)
        │
        ▼
    Grafana:3001 (visualizes metrics)
```

## Components

### 1. Metrics Instrumentation

Each Go service has been instrumented with Prometheus metrics:

#### API Gateway (`services/api-gateway/internal/middleware/metrics.go`)
- `http_requests_total`: Counter for total requests by method, route, and status
- `http_request_duration_seconds`: Histogram for request latency

#### User Service (`services/user-service/internal/middleware/metrics.go`)
- `http_requests_total`: Counter for user service requests
- `http_request_duration_seconds`: Histogram for response latency

#### Matchmaking Service (`services/matchmaking-service/internal/middleware/metrics.go`)
- `http_requests_total`: Counter for matchmaking requests
- `http_request_duration_seconds`: Histogram for response latency
- `nats_events_total`: Counter for NATS event processing (success/error)

### 2. Prometheus Configuration

**File**: `deploy/prometheus.yml`

Configuration includes:
- Global scrape interval: 5s (for responsive live metrics)
- 4 scrape targets:
  - api-gateway (localhost:8080)
  - user-service (localhost:8081)
  - matchmaking-service (localhost:8082)
  - Prometheus self-monitoring (localhost:9090)

### 3. Grafana Dashboard

**File**: `deploy/grafana-dashboard.json`

Pre-built dashboard with 6 panels:

1. **System Throughput (RPS)** - Gauge showing requests/second across all services
2. **API Gateway Latency** - P95/P99 latencies (milliseconds)
3. **HTTP Status Distribution** - Success/error rates over time
4. **NATS Events Processing** - Exchange event consumption metrics
5. **User Service Latency** - P95/P99 latencies
6. **Matchmaking Service Latency** - P95/P99 latencies

## Quick Start (5 minutes)

### Prerequisites

- Docker installed
- Backend services running (`go run .` from root)
- All three services healthy on ports 8080, 8081, 8082

### Step 1: Start Prometheus

```bash
# Linux/macOS
docker run -d --name=prometheus -p 9090:9090 \
  -v $(pwd)/deploy/prometheus.yml:/etc/prometheus/prometheus.yml \
  prom/prometheus --config.file=/etc/prometheus/prometheus.yml

# Windows PowerShell
docker run -d --name=prometheus -p 9090:9090 `
  -v "$((Get-Location).Path)\deploy\prometheus.yml:/etc/prometheus/prometheus.yml" `
  prom/prometheus --config.file=/etc/prometheus/prometheus.yml
```

**Verify**: Open http://localhost:9090
- Check **Status > Targets** - all 4 targets should show "UP" (may take 10-15 seconds)

### Step 2: Start Grafana

```bash
docker run -d --name=grafana -p 3001:3000 grafana/grafana
```

**Verify**: Open http://localhost:3001
- Login: admin / admin
- Create new password (first login)

### Step 3: Add Prometheus Data Source

1. In Grafana, go to **Settings > Data Sources**
2. Click **Add new data source**
3. Select **Prometheus**
4. Set URL to `http://host.docker.internal:9090` (Mac/Windows) or `http://localhost:9090` (Linux)
5. Click **Save & Test** (should show green checkmark)

### Step 4: Import Dashboard

1. In Grafana, go to **+** (create) icon → **Import Dashboard**
2. Open `deploy/grafana-dashboard.json` in a text editor and copy contents
3. Paste into the "Import via panel JSON" field
4. Click **Load**
5. Select the Prometheus data source from the dropdown
6. Click **Import**

**Result**: Dashboard appears with live metrics updating every 5 seconds

## Testing the Pipeline

### Generate Load (Confirm metrics are flowing)

```bash
# Terminal 1: Run backend
go run .

# Terminal 2: Generate traffic
for i in {1..100}; do curl -s http://localhost:8080/api/v1/health > /dev/null; done
```

### Verify Metrics in Prometheus

1. Open http://localhost:9090/graph
2. Type in query box: `http_requests_total`
3. Click **Execute**
4. Verify metrics appear with timestamps

### Key Queries

- System throughput: `sum(rate(http_requests_total[1m])) / 60`
- API Gateway P95: `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{job="api-gateway"}[5m])) by (le))`
- Error rate: `sum(rate(http_requests_total{status=~"5.."}[1m]))`
- NATS event errors: `rate(nats_events_total{status="error"}[1m])`

## Production Considerations

### Security
- Prometheus and Grafana have no authentication by default in this setup
- For production, use reverse proxy with authentication
- Restrict Prometheus port (9090) to internal network only
- Set Grafana admin password strong

### Data Retention
- Prometheus default: 15 days of metrics
- Adjust `--storage.tsdb.retention.time` flag for longer retention
- Use external storage (Thanos) for long-term metrics

### Performance Tuning
- Increase scrape interval for fewer CPU/disk resources: `--storage.tsdb.retention.time=24h`
- Add alerting rules to detect issues before they impact users
- Use recording rules to pre-compute expensive queries

### Scaling
- Add more services: duplicate scrape configs in `prometheus.yml`
- Use service discovery (Consul, Kubernetes) for dynamic services
- Consider Prometheus federation for multi-cluster setups

## Cleanup

```bash
# Stop containers
docker stop prometheus grafana

# Remove containers (preserves Grafana data volumes)
docker rm prometheus grafana

# Remove all (WARNING: deletes Grafana config/dashboards)
docker rm -v prometheus grafana
```

## Troubleshooting

### Prometheus targets show "DOWN"

**Check**: 
- Backend services running? `go run .` from root
- Services listening on correct ports? `netstat -an | grep 8080`
- Prometheus can reach them? From inside container: `docker exec prometheus curl localhost:8080/metrics`

**Fix**:
```bash
# Restart Prometheus with debugging
docker logs prometheus
docker restart prometheus
```

### Grafana can't reach Prometheus

**Check**:
- Data source URL correct: `http://host.docker.internal:9090` (Mac) or `http://prometheus:9090` (Docker network)
- Prometheus running? `docker ps | grep prometheus`

**Fix**:
```bash
# Test from Grafana container
docker exec grafana curl http://host.docker.internal:9090/api/v1/query?query=up
```

### No data in dashboard

**Wait** 15-20 seconds after starting Prometheus (first scrape takes time)

**Check**:
- Prometheus has scraped targets: http://localhost:9090/targets
- Metrics exposed: `curl http://localhost:8080/metrics`

**Fix**:
```bash
# Generate traffic to create metrics
for i in {1..50}; do curl -s http://localhost:8080/api/v1/health & done
wait
```

## Next Steps

- Add custom metrics to track business events (e.g., exchange completions)
- Create alert rules for critical thresholds
- Add distributed tracing (Jaeger) for end-to-end request flow
- Export metrics to long-term storage (InfluxDB, TimescaleDB)
- Build runbooks for common issues detected by metrics
