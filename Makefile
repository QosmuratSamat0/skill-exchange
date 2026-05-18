.PHONY: help dev dev-down dev-logs dev-build frontend-dev backend-dev build test lint config-check observability-start observability-stop observability-clean observability-docs

help:
	@echo "Pairexx — доступные команды:"
	@echo ""
	@echo "  make dev           — запустить инфраструктуру (Docker: postgres, redis, nats)"
	@echo "  make dev-down      — остановить стек"
	@echo "  make dev-logs      — логи всех сервисов"
	@echo "  make dev-build     — пересобрать образы"
	@echo "  make frontend-dev  — запустить фронтенд локально (без Docker)"
	@echo "  make backend-dev   — запустить микросервисы локально (go run .)"
	@echo "  make build         — скомпилировать все Go-сервисы"
	@echo "  make test          — запустить тесты"
	@echo "  make lint          — запустить линтер"
	@echo "  make config-check  — проверить наличие config.env и обязательных переменных"
	@echo ""
	@echo "Observability (Bonus 2 — 10% extra credit):"
	@echo "  make observability-start  — запустить Prometheus и Grafana (Docker)"
	@echo "  make observability-stop   — остановить Prometheus и Grafana"
	@echo "  make observability-clean  — удалить контейнеры и данные"
	@echo "  make observability-docs   — открыть документацию"
	@echo ""
	@echo "Первый запуск:"
	@echo "  cp config.env.example config.env"
	@echo "  (затем заполните SMTP_SENDER и SMTP_PASSWORD)"

dev:
	$(MAKE) config-check
	docker compose -f infrastructure/docker/docker-compose.dev.yml --env-file .env up -d

dev-down:
	docker compose -f infrastructure/docker/docker-compose.dev.yml down

dev-logs:
	docker compose -f infrastructure/docker/docker-compose.dev.yml logs -f

dev-build:
	@echo "No build step for infra-only compose (postgres, redis, nats)."

frontend-dev:
	cd apps/web && npm run dev

backend-dev:
	$(MAKE) config-check
	go run .

build:
	go build ./services/api-gateway/... ./services/user-service/... ./services/matchmaking-service/... ./services/chat-service/... ./services/moderation-service/... ./services/notification-service/...

test:
	go test ./services/...

lint:
	go vet ./services/...

# ── Environment guard ────────────────────────────────────────────────────────
# Pure Go implementation — no bash, no cmd.exe quirks, works on every OS.
# Checks that config.env exists and that all required SMTP/routing vars are set.
config-check:
	go run ./tools/config-check

# ── Observability Stack (Bonus 2 — 10% extra credit) ─────────────────────────
# Prometheus + Grafana setup for metrics, logging, and tracing.

observability-start:
	@echo Starting Observability Stack...
	@echo.
	@echo Use one of these instead:
	@echo   - Windows batch: observability-start.bat
	@echo   - Windows PowerShell: .\observability.ps1
	@echo   - Or run directly:
	@echo     docker stop prometheus grafana 2>nul
	@echo     docker run -d --name=prometheus -p 9090:9090 ^
	@echo       -v "%CD%\deploy\prometheus.yml:/etc/prometheus/prometheus.yml" ^
	@echo       prom/prometheus --config.file=/etc/prometheus/prometheus.yml
	@echo     docker run -d --name=grafana -p 3001:3000 grafana/grafana

observability-stop:
	docker stop prometheus grafana

observability-clean:
	docker stop prometheus grafana
	docker rm prometheus grafana

observability-docs:
	@echo Observability Documentation:
	@echo - Main guide: deploy/OBSERVABILITY.md
	@echo - Quick ref: deploy/QUICK_REFERENCE.md
	@echo - Windows setup: deploy/WINDOWS_SETUP.md
