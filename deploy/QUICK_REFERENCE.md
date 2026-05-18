# Observability Stack - Quick Reference

## 🚀 One-Minute Setup

### Terminal 1: Start Backend Services
```bash
go run .
```

### Terminal 2: Start Prometheus
```bash
docker run -d --name=prometheus -p 9090:9090 \
  -v $(pwd)/deploy/prometheus.yml:/etc/prometheus/prometheus.yml \
  prom/prometheus --config.file=/etc/prometheus/prometheus.yml
```

### Terminal 3: Start Grafana
```bash
docker run -d --name=grafana -p 3001:3000 grafana/grafana
```

## 📊 Access Points

| Component | URL | Purpose |
|-----------|-----|---------|
| API Gateway | http://localhost:8080 | Main ingress |
| User Service | http://localhost:8081 | User operations |
| Matchmaking Service | http://localhost:8082 | Matching logic |
| **Prometheus** | **http://localhost:9090** | **Metrics DB** |
| **Grafana** | **http://localhost:3001** | **Dashboards** |

## 🎯 Metrics Endpoints

```bash
# View raw metrics
curl http://localhost:8080/metrics  # API Gateway
curl http://localhost:8081/metrics  # User Service
curl http://localhost:8082/metrics  # Matchmaking Service

# Check Prometheus scrape status
curl http://localhost:9090/api/v1/targets

# Query specific metric
curl 'http://localhost:9090/api/v1/query?query=http_requests_total'
```

## 📈 Dashboard Import (Grafana)

1. Open http://localhost:3001 → **+** → **Import**
2. Select **Upload JSON file**
3. Choose: `deploy/grafana-dashboard.json`
4. Select **Prometheus** datasource
5. Click **Import** → View live metrics

## 🔍 Key Queries (Prometheus)

```promql
# System throughput (RPS)
sum(rate(http_requests_total[1m])) / 60

# API Gateway P95 latency
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{job="api-gateway"}[5m])) by (le))

# Error rate (5xx)
sum(rate(http_requests_total{status=~"5.."}[1m]))

# NATS event success rate
rate(nats_events_total{status="success"}[1m])

# User service availability
sum(rate(http_requests_total{job="user-service",status="200"}[5m])) / sum(rate(http_requests_total{job="user-service"}[5m]))
```

## 🧪 Generate Load (for demo)

```bash
# Quick test - 100 requests
for i in {1..100}; do curl -s http://localhost:8080/api/v1/health > /dev/null; done

# Sustained load - 1000 requests over 30 seconds
ab -n 1000 -c 10 http://localhost:8080/api/v1/health

# Load test with concurrency
for i in {1..50}; do (
  for j in {1..20}; do
    curl -s http://localhost:8080/api/v1/health > /dev/null &
  done
  wait
) done
```

## 🛑 Cleanup

```bash
# Stop containers
docker stop prometheus grafana

# Remove containers
docker rm prometheus grafana

# Full cleanup (preserves data)
docker compose -f infrastructure/docker/docker-compose.dev.yml down
```

## ✅ Verification Checklist

- [ ] Backend services running (`go run .` output shows 3+ services starting)
- [ ] Prometheus targets UP: http://localhost:9090/targets (all green)
- [ ] Grafana logged in: http://localhost:3001 (admin/admin)
- [ ] Dashboard imported and showing metrics
- [ ] All 6 panels displaying data:
  - RPS gauge
  - API Gateway latency
  - HTTP status codes
  - NATS events
  - User Service latency
  - Matchmaking Service latency
- [ ] Load test generates visible metrics

## 📚 Documentation

- **Setup Guide**: `deploy/OBSERVABILITY.md` - Comprehensive troubleshooting
- **Dashboard Details**: `deploy/IMPLEMENTATION_SUMMARY.md` - Panel explanations
- **README**: `README.md` (Bonus 2 section) - High-level overview

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| Prometheus targets DOWN | Verify `go run .` running; check `localhost:8080/metrics` |
| Grafana can't reach Prometheus | Use `http://host.docker.internal:9090` on Mac/Windows |
| No data in dashboard | Wait 15-20s for first scrape; generate load with `curl` loop |
| Docker containers won't start | Check ports 9090/3001 not in use: `netstat -an \| grep 9090` |

## 💡 Pro Tips

- **5-second scrape interval** for responsive demo metrics
- **P95/P99 latencies** prove optimization effectiveness
- **NATS metrics** track async workflow reliability
- **Error code distribution** shows system health at a glance
- **Per-service panels** identify bottlenecks quickly

---

**Status**: ✅ Ready for live grading demonstration
