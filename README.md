# Pairexx - Enterprise Microservices Skill-Exchange Network

**Academic context:** Final Course Project, Group SE-2430
**Project type:** Full-stack microservices platform for skill exchange, matchmaking, real-time chat, moderation, and notifications.

Pairexx helps users publish skills they can teach, discover people with complementary learning goals, start an exchange request, chat in real time, and close the contract through a two-sided "complete exchange" confirmation flow.

## Core Team

| Team member | Primary ownership | Main proof directories |
| --- | --- | --- |
| **Bauyrzhan Nurzhanov** | Developed `api-gateway` as the ingress proxy, `chat-service` as the WebSocket engine with Redis-backed runtime state, and `matchmaking-service` as the state orchestrator with Redis atomic confirmation logic and the multi-voted completion flow. | `services/api-gateway`, `services/chat-service`, `services/matchmaking-service`, `apps/web` |
| **Samat Qosmurat** | Developed `user-service` with relational PostgreSQL persistence, `moderation-service` with automated content safety checks, and `notification-service` with async worker queue and SMTP delivery. | `services/user-service`, `services/moderation-service`, `services/notification-service` |

## Rubric Mapping

This section is intentionally explicit so the project can be audited against the university grading rubric.

| Rubric item | Weight | Implementation proof |
| --- | ---: | --- |
| Clean Architecture | 20% | Layered service folders under `services/*/internal/{domain,repository,usecase,delivery}` |
| gRPC Infrastructure | 20% | Protobuf contracts and generated clients under `libs/proto`, gRPC servers in `user-service` and `matchmaking-service`, gateway clients in `api-gateway` |
| Message Queue - NATS Core | 20% | Shared JetStream wrapper in `libs/shared/mq/nats.go`, event publishers in `matchmaking-service`, subscribers in `notification-service` |
| Databases, Caches, Transactions, Migrations | 20% | PostgreSQL migrations under service `migrations/`, Redis repositories and locking in matchmaking/chat, root launcher migration bootstrap |
| SMTP Email Dispatch | 10% | Gmail SMTP channel, startup probe, dark-mode HTML templates in `notification-service` |
| Testing Coverage | 10% | Go tests in service modules, API smoke/load scripts, frontend TypeScript and ESLint checks |
| Bonus: React/Next.js Web Client | +10% | `apps/web` dashboard client using Next.js, TypeScript, Zustand, TailwindCSS |
| Bonus: Observability Pipeline | +10% | Prometheus `/metrics`, gateway middleware metrics, WebSocket metrics, OpenTelemetry helpers |

## Architecture and Design Specifications

### Clean Architecture (20%)

Each backend service follows a layered architecture that keeps framework bindings, business rules, persistence, and transport code separated.

```text
services/<service-name>/
  cmd/                      # Service bootstrap and dependency wiring
  internal/
    domain/                 # Core entities, interfaces, DTO-free business contracts
    repository/             # PostgreSQL, Redis, or memory persistence implementations
    usecase/                # Application orchestration and business rules
    delivery/               # HTTP, WebSocket, or gRPC handlers
    config/                 # Environment parsing and service configuration
  migrations/               # Service-owned schema migrations where persistent SQL is used
```

Concrete examples:

- `services/user-service/internal/domain/user.go` defines user entities and repository/usecase contracts.
- `services/user-service/internal/repository/postgres/` contains PostgreSQL implementation details.
- `services/user-service/internal/usecase/user_usecase.go` owns authentication/profile business logic.
- `services/user-service/internal/delivery/http/` and `services/user-service/internal/delivery/grpc/` expose transport-specific bindings.
- `services/matchmaking-service/internal/usecase/match_usecase.go` orchestrates exchange request lifecycle, completion voting, NATS events, and real-time notifications.
- `services/chat-service/internal/delivery/ws/` isolates WebSocket hub/client/message handling from chat persistence.

This prevents HTTP JSON handlers, gRPC generated structures, Redis records, and database rows from becoming one mixed model.

### gRPC Infrastructure (20%)

Pairexx uses gRPC for fast internal service-to-service calls where typed contracts matter.

Proof directories:

- `libs/proto/user/v1/user.proto`
- `libs/proto/matchmaking/v1/matchmaking.proto`
- `libs/proto/user/v1/*_grpc.pb.go`
- `libs/proto/matchmaking/v1/*_grpc.pb.go`
- `libs/proto/buf.gen.yaml`
- `services/api-gateway/internal/client/grpc_clients.go`
- `services/user-service/internal/delivery/grpc/handler.go`
- `services/matchmaking-service/internal/delivery/grpc/handler.go`

Compiled protobuf configurations expose:

- `user.v1.UserService`
  - `GetUser`
  - `IsBanned`
  - `UpdateProfile`
  - `Login`
  - `Register`
- `matchmaking.v1.MatchmakingService`
  - `UpdateProfile`
  - `GetCandidates`
  - `SendRequest`
  - `AcceptRequest`
  - `DeclineRequest`

The protobuf files use `repeated` fields for collection-style API contracts such as skill lists and candidate responses:

- `repeated string interests`
- `repeated string i_have`
- `repeated string i_want`
- `repeated Profile candidates`

The API Gateway creates typed gRPC clients for user and matchmaking calls and applies keepalive plus OpenTelemetry gRPC client instrumentation. The local launcher assigns:

- `user-service` HTTP `:8081`, gRPC `:50081`
- `matchmaking-service` HTTP `:8082`, gRPC `:50082`
- `api-gateway` HTTP `:8080`

### Message Queue - NATS Core (20%)

Pairexx uses NATS JetStream to decouple user actions from background notification work.

Proof directories:

- `libs/shared/mq/nats.go`
- `services/matchmaking-service/internal/usecase/match_usecase.go`
- `services/notification-service/internal/usecase/worker.go`
- `services/notification-service/internal/usecase/usecase.go`

Event flow for exchange completion:

```text
User clicks "Complete exchange"
  -> api-gateway
  -> matchmaking-service
  -> Redis confirmation flag updated
  -> NATS JetStream event
  -> notification-service worker
  -> PostgreSQL in-app notification + SMTP email
```

Important subjects:

- `exchange.completion_triggered`
  - Published when the first participant clicks "Complete exchange".
  - Consumed by `notification-service`.
  - Creates an in-app notification for the other user.
  - Sends an email asking the other user to open `/dashboard/chats` and confirm.
- `exchange.completed`
  - Published when both participants have confirmed.
  - Consumed by `notification-service`.
  - Sends final confirmation notifications/emails to both users.

`libs/shared/mq/nats.go` creates/updates the `EVENTS` stream and uses durable consumers so async work remains isolated from request-response latency.

### Databases, Caches, Transactions, Migrations (20%)

#### PostgreSQL

PostgreSQL stores durable relational data with service-owned migrations.

Proof directories:

- `services/user-service/migrations/`
- `services/chat-service/migrations/`
- `services/moderation-service/migrations/`
- `services/notification-service/migrations/`
- `infrastructure/docker/postgres/init/00-create-dbs.sql`

The root launcher applies migrations before starting local services. Logs show migration application per database, for example:

- `users_db`
- `chat_db`
- `moderation_db`
- `notification_db`

PostgreSQL usage examples:

- user credentials, profiles, email preferences in `user-service`
- persisted chat rooms/messages in `chat-service`
- moderation reports in `moderation-service`
- in-app notification records in `notification-service`

#### Redis

Redis is used for high-speed state, cache, locks, and exchange lifecycle coordination.

Proof directories:

- `services/matchmaking-service/internal/repository/redis/`
- `services/chat-service/internal/delivery/ws/`
- `services/api-gateway/internal/middleware/ratelimit_redis.go`
- `infrastructure/docker/docker-compose.dev.yml`

Redis responsibilities:

- Matchmaking profile and request state.
- Atomic exchange completion flags:
  - `sender_confirmed_complete`
  - `recipient_confirmed_complete`
  - final `COMPLETED` status after both confirmations.
- WebSocket presence/runtime state.
- Gateway rate-limit backing store.
- Connection pooling through Redis client configuration.

### SMTP Email Dispatch (10%)

The notification service sends HTML email through secure SMTP.

Proof directories:

- `services/notification-service/internal/channel/smtp/smtp.go`
- `services/notification-service/cmd/main.go`
- `config.env.example`

SMTP behavior:

- Uses Gmail SMTP by default:
  - `SMTP_HOST=smtp.gmail.com`
  - `SMTP_PORT=587`
- Opens TCP connection with deadline.
- Upgrades to STARTTLS.
- Authenticates with Gmail App Password.
- Sends HTML email with `Content-Type: text/html; charset=UTF-8`.
- Fetches recipient email preferences from `user-service` through an internal endpoint protected by `X-Internal-Token`.

Startup safety:

- `notification-service` prints a `[smtp-probe]` sequence at boot.
- The probe validates TCP, STARTTLS, and Gmail authentication before real events arrive.
- Misconfigured Gmail credentials are reported with an actionable checklist.

Email templates include:

- Exchange request email.
- First-click completion prompt:
  - "Ваш партнер предлагает завершить обмен навыками! Пожалуйста, зайдите в чат и подтвердите завершение."
  - CTA: `http://localhost:3000/dashboard/chats`
- Final completion email:
  - "Обмен успешно завершен!"
  - CTA to the dashboard.

### Testing Coverage (10%)

Backend tests are written close to the layer they verify.

Proof files:

- `services/api-gateway/internal/middleware/auth_test.go`
- `services/matchmaking-service/internal/usecase/matcher_test.go`
- `services/matchmaking-service/internal/repository/redis/redis_repository_test.go`
- `scripts/api-smoke-test.js`
- `scripts/load-test.js`
- `load-tests/api_load_test.js`

Because this repository is a Go workspace with multiple nested Go modules, run `go test ./...` inside each module. For a full audit pass from the repository root:

```powershell
$modules = @(
  ".",
  "libs/proto",
  "libs/shared",
  "services/api-gateway",
  "services/user-service",
  "services/matchmaking-service",
  "services/chat-service",
  "services/moderation-service",
  "services/notification-service"
)

foreach ($module in $modules) {
  Push-Location $module
  go test ./...
  Pop-Location
}
```

Frontend verification:

```powershell
cd apps/web
npx tsc --noEmit
npx eslint
```

Load and smoke testing:

```powershell
node scripts/api-smoke-test.js
node scripts/load-test.js
```

## Bonus Requirements

### Bonus 1 - React/Next.js Web Client (+10%)

The web client is implemented in `apps/web` with:

- Next.js 15 App Router.
- TypeScript.
- Zustand for cross-dashboard state.
- TailwindCSS for responsive UI.
- Browser WebSocket integration for live chat.
- Server-Sent Events for notification and match updates.
- Optimistic UI state for request acceptance, chat unread badges, and exchange completion.
- Dashboard routes under `/dashboard`, including:
  - `/dashboard`
  - `/dashboard/find`
  - `/dashboard/chats`
  - `/dashboard/notifications`
  - `/dashboard/settings`

Relevant frontend proof:

- `apps/web/src/app/dashboard/layout.tsx`
- `apps/web/src/app/dashboard/find/page.tsx`
- `apps/web/src/app/dashboard/chats/page.tsx`
- `apps/web/src/app/dashboard/notifications/page.tsx`
- `apps/web/src/hooks/useChat.ts`
- `apps/web/src/store/chatStore.ts`
- `apps/web/src/lib/api.ts`
- `apps/web/src/lib/socket.ts`

Key UX behaviors:

- Active chat sidebar and selected contact state remain synchronized.
- Incoming messages update the active conversation immediately.
- Online/offline and typing signals are handled over real-time channels.
- Pending notification and unread chat badges render on dashboard navigation.
- Completed exchanges show "Обмен успешно завершен" on the Find Skills page instead of the old connected state.

### Bonus 2 - Observability Pipeline (+10%)

Pairexx exposes runtime observability through metrics and tracing hooks.

Proof directories:

- `services/api-gateway/internal/middleware/metrics.go`
- `services/user-service/internal/middleware/metrics.go`
- `services/matchmaking-service/internal/middleware/metrics.go`
- `services/api-gateway/internal/middleware/tracing.go`
- `services/chat-service/internal/delivery/ws/hub.go`
- `libs/shared/tracing/otel.go`
- `services/*/cmd/main.go`
- `deploy/prometheus.yml`
- `deploy/grafana-dashboard.json`

Implemented observability:

- Prometheus `/metrics` endpoints on backend services (api-gateway, user-service, matchmaking-service).
- API Gateway HTTP request counters and duration histograms.
- User Service HTTP request counters and duration histograms.
- Matchmaking Service HTTP request counters, duration histograms, and NATS event processing metrics.
- WebSocket connection and message counters in `chat-service`.
- OpenTelemetry helper for OTLP HTTP trace export.
- gRPC client instrumentation in the API Gateway.

#### Running Prometheus and Grafana Locally

**Option 1: Docker (Recommended for live demonstration)**

Start Prometheus:

```bash
docker run -d --name=prometheus -p 9090:9090 \
  -v $(pwd)/deploy/prometheus.yml:/etc/prometheus/prometheus.yml \
  prom/prometheus --config.file=/etc/prometheus/prometheus.yml
```

On Windows (PowerShell):

```powershell
docker run -d --name=prometheus -p 9090:9090 `
  -v "$((Get-Location).Path)\deploy\prometheus.yml:/etc/prometheus/prometheus.yml" `
  prom/prometheus --config.file=/etc/prometheus/prometheus.yml
```

Start Grafana:

```bash
docker run -d --name=grafana -p 3001:3000 grafana/grafana
```

**Option 2: Docker Compose**

Add to your `docker-compose.dev.yml`:

```yaml
prometheus:
  image: prom/prometheus:latest
  ports:
    - "9090:9090"
  volumes:
    - ./deploy/prometheus.yml:/etc/prometheus/prometheus.yml
  command:
    - '--config.file=/etc/prometheus/prometheus.yml'
  networks:
    - default

grafana:
  image: grafana/grafana:latest
  ports:
    - "3001:3000"
  environment:
    GF_SECURITY_ADMIN_PASSWORD: admin
  networks:
    - default
```

Then run:

```bash
docker compose -f infrastructure/docker/docker-compose.dev.yml up -d prometheus grafana
```

#### Accessing the Observability Stack

- **Prometheus**: `http://localhost:9090`
  - Query builder and metrics exploration
  - Check scrape targets under **Status > Targets**
- **Grafana**: `http://localhost:3001`
  - Default credentials: `admin` / `admin` (reset on first login)
  - Add Prometheus as a data source: `http://prometheus:9090` (or `http://host.docker.internal:9090` from within container)

#### Importing the Pairexx Dashboard

1. In Grafana, go to **+** → **Import Dashboard**
2. Paste the contents of `deploy/grafana-dashboard.json`
3. Select the Prometheus data source
4. Click **Import**

The dashboard displays:

- **Throughput (RPS)**: Live requests per second across all services
- **API Gateway Latency**: P95 and P99 response times
- **User Service Latency**: P95 and P99 response times
- **Matchmaking Service Latency**: P95 and P99 response times
- **HTTP Status Codes**: 2xx (green), 4xx (yellow), 5xx (red) error distribution
- **NATS Events Processing**: Success and error rates for exchange completion events

#### Cleanup

```bash
docker stop prometheus grafana
docker rm prometheus grafana
```

## Enterprise Folder Layout

```text
Pairexx/
  README.md
  Makefile
  main.go                         # Root launcher for all Go services
  go.work                         # Multi-module Go workspace
  go.mod
  .env.example                    # Infrastructure secrets template
  config.env.example              # SMTP and service routing template

  apps/
    web/                          # Next.js + TypeScript dashboard client
      src/app/dashboard/
      src/hooks/
      src/store/
      src/lib/

  libs/
    proto/                        # Protobuf definitions and generated gRPC code
      user/v1/
      matchmaking/v1/
      buf.gen.yaml
    shared/                       # Shared Go libraries
      mq/nats.go
      tracing/otel.go

  services/
    api-gateway/                  # HTTP ingress, auth, BFF routes, gRPC clients
      internal/client/
      internal/handler/
      internal/middleware/
      internal/proxy/
    user-service/                 # Users, auth, profiles, preferences
      internal/domain/
      internal/repository/
      internal/usecase/
      internal/delivery/
      migrations/
    matchmaking-service/          # Matching, exchange requests, completion flow
      internal/domain/
      internal/repository/redis/
      internal/usecase/
      internal/delivery/
    chat-service/                 # Rooms, messages, WebSocket hub
      internal/domain/
      internal/repository/postgres/
      internal/delivery/http/
      internal/delivery/ws/
      migrations/
    moderation-service/           # Reports and automated content safety
      internal/domain/
      internal/repository/
      internal/usecase/
      internal/delivery/http/
      migrations/
    notification-service/         # NATS worker, in-app notifications, SMTP
      internal/channel/
      internal/repository/postgres/
      internal/usecase/
      internal/delivery/http/
      migrations/

  infrastructure/
    docker/
      docker-compose.dev.yml      # Local Postgres, Redis, NATS
      postgres/init/

  scripts/
    api-smoke-test.js
    load-test.js
    test.ps1

  load-tests/
    api_load_test.js

  tools/
    config-check/                 # Config validation CLI
```

## Service Ports

| Component | Port | Protocol |
| --- | ---: | --- |
| API Gateway | 8080 | HTTP |
| User Service | 8081 | HTTP |
| User Service | 50081 | gRPC |
| Matchmaking Service | 8082 | HTTP |
| Matchmaking Service | 50082 | gRPC |
| Chat Service | 8083 | HTTP/WebSocket |
| Moderation Service | 8084 | HTTP |
| Notification Service | 8085 | HTTP/NATS worker |
| Web Client | 3000 | HTTP |
| PostgreSQL | 5432 | TCP |
| Redis | 6379 | TCP |
| NATS | 4222 | TCP |
| NATS Monitoring | 8222 | HTTP |

## Definitive 5-Minute Setup and Launch Guide

### 1. Local prerequisites

Install:

- Go `1.25+`
- Node.js `20+`
- npm
- Docker Desktop or local PostgreSQL, Redis, and NATS
- Make, optional but recommended

The backend expects the following local infrastructure. You can run these with your own local installs, or use the Docker command in step 3 after the environment files exist:

- PostgreSQL `localhost:5432`
- Redis `localhost:6379`
- NATS `localhost:4222`

### 2. Environment configuration

Create local environment files:

```powershell
Copy-Item .env.example .env
Copy-Item config.env.example config.env
```

On macOS/Linux:

```bash
cp .env.example .env
cp config.env.example config.env
```

Edit `config.env` and set:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SENDER=your-email@gmail.com
SMTP_PASSWORD="your-16-character-app-password"
USER_SERVICE_URL=http://localhost:8081
NOTIFICATION_SERVICE_URL=http://localhost:8085
```

Do not commit real `.env` or `config.env` values.

### 3. Config integrity check

```powershell
make config-check
```

This runs `tools/config-check` and verifies that required SMTP and service routing variables are present before the services boot.

If the Docker infrastructure is not already running, start it now:

```powershell
make dev
```

Equivalent direct Docker command:

```powershell
docker compose -f infrastructure/docker/docker-compose.dev.yml --env-file .env up -d
```

### 4. Run the entire backend architecture

```powershell
go run .
```

The root launcher:

- loads `.env` and `config.env`;
- applies service database migrations;
- starts all backend services concurrently;
- starts ports `8080` through `8085`;
- starts gRPC ports `50081` and `50082`;
- keeps service output in one terminal.

Expected local URLs:

- API Gateway: `http://localhost:8080`
- User Service: `http://localhost:8081`
- Matchmaking Service: `http://localhost:8082`
- Chat Service: `http://localhost:8083`
- Moderation Service: `http://localhost:8084`
- Notification Service: `http://localhost:8085`

### 5. Run the web client

Open a second terminal:

```powershell
cd apps/web
npm install
npm run dev
```

Open:

```text
http://localhost:3000/dashboard
```

## Main Product Flows

### Skill Profile

1. User enters skills they can teach.
2. User enters skills they want to learn.
3. Frontend persists the profile through API Gateway.
4. Matchmaking stores profile state and serves candidate recommendations.

### Exchange Request

1. User sends an exchange request from `/dashboard/find`.
2. Recipient receives notification.
3. Recipient accepts.
4. Chat room becomes available under `/dashboard/chats`.

### Complete Skill Exchange

1. First participant clicks "Завершить обмен".
2. `matchmaking-service` verifies the user is either sender or recipient.
3. Redis stores that participant's confirmation flag.
4. `exchange.completion_triggered` is published to NATS.
5. `notification-service` sends an email and creates an in-app notification for the other participant.
6. Second participant clicks "Завершить обмен".
7. Redis transitions the request status to `COMPLETED`.
8. `exchange.completed` is published to NATS.
9. Both users receive final notifications.
10. The Find Skills page renders "Обмен успешно завершен".

Primary endpoint:

```http
POST /api/v1/match/requests/:id/complete
```

## Makefile Commands

| Command | Purpose |
| --- | --- |
| `make help` | Show available commands |
| `make dev` | Start local infrastructure: PostgreSQL, Redis, NATS |
| `make dev-down` | Stop local infrastructure |
| `make dev-logs` | Tail infrastructure logs |
| `make frontend-dev` | Start Next.js frontend |
| `make backend-dev` | Run config check, then `go run .` |
| `make build` | Build all Go services |
| `make test` | Run configured service tests; use the per-module loop above for a complete audit |
| `make lint` | Run `go vet` for service modules |
| `make config-check` | Validate `config.env` |

## Security and Configuration Notes

- JWT and internal service tokens are loaded from environment variables.
- Internal endpoints require `X-Internal-Token`.
- SMTP passwords must be Gmail App Passwords, not normal account passwords.
- Real secrets belong only in `.env` and `config.env`.
- `config.env.example` is safe to commit and contains placeholders only.
- API Gateway includes auth middleware, internal-route denial middleware, Redis-backed rate limiting, metrics, and tracing.

## License

This repository is submitted as an educational final course project for Group SE-2430.
