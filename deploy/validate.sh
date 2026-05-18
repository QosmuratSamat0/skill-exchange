#!/bin/bash
# Observability Pipeline Validation Script
# Run this to verify all components are correctly set up

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║   Pairexx Observability Pipeline - Validation Checklist       ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASS_COUNT=0
TOTAL_COUNT=0

check_file() {
    TOTAL_COUNT=$((TOTAL_COUNT+1))
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} $2"
        PASS_COUNT=$((PASS_COUNT+1))
    else
        echo -e "${RED}✗${NC} $2"
    fi
}

check_string() {
    TOTAL_COUNT=$((TOTAL_COUNT+1))
    if grep -q "$2" "$1" 2>/dev/null; then
        echo -e "${GREEN}✓${NC} $3"
        PASS_COUNT=$((PASS_COUNT+1))
    else
        echo -e "${RED}✗${NC} $3"
    fi
}

echo "📁 Configuration Files:"
check_file "deploy/prometheus.yml" "Prometheus configuration"
check_file "deploy/grafana-dashboard.json" "Grafana dashboard JSON"
check_file "deploy/OBSERVABILITY.md" "Observability documentation"
check_file "deploy/IMPLEMENTATION_SUMMARY.md" "Implementation summary"
check_file "deploy/QUICK_REFERENCE.md" "Quick reference guide"

echo ""
echo "🔧 Service Middleware Files:"
check_file "services/api-gateway/internal/middleware/metrics.go" "API Gateway metrics middleware"
check_file "services/user-service/internal/middleware/metrics.go" "User Service metrics middleware (NEW)"
check_file "services/matchmaking-service/internal/middleware/metrics.go" "Matchmaking Service metrics middleware (NEW)"

echo ""
echo "📝 Service Integration:"
check_string "services/api-gateway/cmd/main.go" "promhttp" "API Gateway prometheus import"
check_string "services/user-service/cmd/main.go" "gwMiddleware.Metrics" "User Service metrics middleware integration"
check_string "services/matchmaking-service/cmd/main.go" "gwMiddleware.Metrics" "Matchmaking Service metrics middleware integration"
check_string "services/user-service/cmd/main.go" "promhttp.Handler()" "User Service metrics endpoint"
check_string "services/matchmaking-service/cmd/main.go" "promhttp.Handler()" "Matchmaking Service metrics endpoint"

echo ""
echo "⚙️ Prometheus Configuration:"
check_string "deploy/prometheus.yml" "scrape_interval: 5s" "5-second scrape interval"
check_string "deploy/prometheus.yml" "api-gateway" "API Gateway scrape target"
check_string "deploy/prometheus.yml" "user-service" "User Service scrape target"
check_string "deploy/prometheus.yml" "matchmaking-service" "Matchmaking Service scrape target"

echo ""
echo "📊 Grafana Dashboard:"
check_string "deploy/grafana-dashboard.json" "System Throughput" "Panel 1: RPS Gauge"
check_string "deploy/grafana-dashboard.json" "API Gateway.*Latency" "Panel 2: API Gateway Latency"
check_string "deploy/grafana-dashboard.json" "HTTP Status Code" "Panel 3: Error Distribution"
check_string "deploy/grafana-dashboard.json" "NATS Events" "Panel 4: NATS Events"
check_string "deploy/grafana-dashboard.json" "User Service.*Duration" "Panel 5: User Service Latency"
check_string "deploy/grafana-dashboard.json" "Matchmaking Service.*Duration" "Panel 6: Matchmaking Service Latency"

echo ""
echo "📖 Documentation:"
check_string "README.md" "Bonus 2.*Observability" "README updated with Bonus 2 section"
check_string "README.md" "docker run.*prometheus" "Docker command for Prometheus"
check_string "README.md" "docker run.*grafana" "Docker command for Grafana"

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                      VALIDATION SUMMARY                        ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo -e "Checks passed: ${GREEN}${PASS_COUNT}/${TOTAL_COUNT}${NC}"

if [ $PASS_COUNT -eq $TOTAL_COUNT ]; then
    echo -e "${GREEN}✅ All observability components are correctly implemented!${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Start backend:  go run ."
    echo "  2. Start Prometheus: docker run -d --name=prometheus -p 9090:9090 \\"
    echo "                        -v \$(pwd)/deploy/prometheus.yml:/etc/prometheus/prometheus.yml \\"
    echo "                        prom/prometheus"
    echo "  3. Start Grafana: docker run -d --name=grafana -p 3001:3000 grafana/grafana"
    echo "  4. Import dashboard at http://localhost:3001"
    exit 0
else
    echo -e "${RED}⚠️  Some components are missing. Please review the output above.${NC}"
    exit 1
fi
