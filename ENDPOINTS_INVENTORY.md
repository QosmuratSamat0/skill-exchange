# Pairexx Microservices - Complete Endpoint Inventory

## Summary Statistics

| Service | HTTP Endpoints | gRPC Services | /metrics | Total |
|---------|---|---|---|---|
| **API Gateway** | 13 | — | ✅ | **13** |
| **User Service** | 20 | ✅ UserService | ✅ | **21** |
| **Matchmaking Service** | 23 | ✅ MatchmakingService | ✅ | **24** |
| **Chat Service** | 3 | — | ✅ | **4** |
| **Moderation Service** | 5 | — | ✅ | **6** |
| **Notification Service** | 3 | — | ✅ | **4** |
| **WebSocket** | 3 | — | — | **3** |
| — | — | — | — | — |
| **TOTAL** | **70 HTTP** | **2 gRPC** | **5 /metrics** | **77** |

---

## Detailed Endpoint Listing

### 1. API Gateway (Port 8080) — 13 Endpoints

#### Health & Documentation
- `GET /api/v1/health` — Health check
- `GET /api/v1/docs/swagger.yaml` — OpenAPI spec
- `GET /api/v1/docs/*` — Swagger UI

#### Authentication (gRPC-backed)
- `POST /api/v1/users/anonymous` — Create anonymous user
- `POST /api/v1/users/register` — Register account
- `POST /api/v1/users/login` — Login
- `POST /api/v1/users/refresh` — Refresh JWT

#### User Profile (gRPC-backed)
- `GET /api/v1/users/me` — Get authenticated user
- `PUT /api/v1/users/me` — Update profile
- `GET /api/v1/users/{id}` — Get user by ID

#### BFF (Backend-for-Frontend)
- `GET /api/v1/bff/me` — Get complete user context

#### Proxied Routes (to other services)
- `GET /api/v1/*` — Proxy matchmaking, chat, moderation, notifications
- `POST /api/v1/*` — Proxy mutations
- `PUT /api/v1/*` — Proxy updates
- `PATCH /api/v1/*` — Proxy patches
- `DELETE /api/v1/*` — Proxy deletes

#### Real-time WebSocket
- `WS /ws` — Chat WebSocket
- `WS /dashboard/chats/ws` — Dashboard chat WebSocket

#### Observability
- `GET /metrics` — Prometheus metrics (NEW)

---

### 2. User Service (Port 8081) — 20 HTTP + 1 gRPC

#### Public Authentication
- `POST /api/v1/users/anonymous` — Create anonymous user
- `POST /api/v1/users/register` — Register account
- `POST /api/v1/users/login` — Login
- `POST /api/v1/users/refresh` — Refresh JWT

#### Authenticated User Profile
- `GET /api/v1/users/me` — Get my profile
- `PUT /api/v1/users/me` — Update profile
- `PUT /api/v1/users/me/profile` — Update profile details
- `PATCH /api/v1/users/me/preferences` — Update email preferences
- `GET /api/v1/users/me/profile` — Get full profile
- `PUT /api/v1/users/me/password` — Change password
- `DELETE /api/v1/users/me` — Delete account
- `GET /api/v1/users/me/sessions` — List active sessions
- `POST /api/v1/users/logout` — Logout current session
- `POST /api/v1/users/logout-all` — Logout all sessions

#### Public User Profiles
- `GET /api/v1/users/{id}/profile` — Get public profile
- `GET /api/v1/users/{id}/reviews` — Get user reviews
- `GET /api/v1/users/{id}/status` — Get ban status

#### User Reviews
- `POST /api/v1/users/{id}/review` — Add review to user

#### Internal Endpoints (X-Internal-Token required)
- `POST /api/v1/users/internal/ban` — Ban user
- `POST /api/v1/users/internal/unban` — Unban user
- `GET /api/v1/users/internal/users` — List all users
- `GET /api/v1/users/internal/users/{id}/bans` — List user bans
- `GET /api/v1/users/internal/users/{id}/preferences` — Get user preferences

#### Service Health
- `GET /api/v1/users/health` — Health check

#### gRPC Service (Port 50081)
- `user.v1.UserService.GetUser`
- `user.v1.UserService.IsBanned`
- `user.v1.UserService.UpdateProfile`
- `user.v1.UserService.Login`
- `user.v1.UserService.Register`

#### Observability
- `GET /metrics` — Prometheus metrics (NEW)

---

### 3. Matchmaking Service (Port 8082) — 23 HTTP + 1 gRPC

#### User Profile Management
- `PUT /api/v1/match/profile` — Create/update profile
- `GET /api/v1/match/profile` — Get own profile
- `DELETE /api/v1/match/profile` — Delete profile
- `GET /api/v1/match/profile/{userID}` — Get any profile

#### Candidate Discovery
- `GET /api/v1/match/candidates` — Get smart matches (SINTER)
- `GET /api/v1/match/candidates/skill/{skill}` — Search by skill

#### Exchange Requests
- `POST /api/v1/match/request` — Send request
- `GET /api/v1/match/requests/incoming` — Get incoming requests
- `GET /api/v1/match/requests/sent` — Get sent requests
- `POST /api/v1/match/request/{id}/accept` — Accept request
- `POST /api/v1/match/request/{id}/decline` — Decline request
- `POST /api/v1/match/requests/{id}/complete` — Complete exchange
- `DELETE /api/v1/match/request/{id}` — Cancel request

#### Chat Rooms
- `GET /api/v1/match/room` — Get current room
- `GET /api/v1/match/rooms` — Get all rooms (history)

#### User Status
- `PUT /api/v1/match/status` — Set online/offline
- `GET /api/v1/match/status/{userID}` — Get user status

#### Statistics
- `GET /api/v1/match/stats` — Get match stats

#### Real-time Events (Server-Sent Events)
- `GET /api/v1/match/notifications` — SSE stream for notifications

#### Service Health
- `GET /api/v1/match/health` — Health check

#### gRPC Service (Port 50082)
- `matchmaking.v1.MatchmakingService.UpdateProfile`
- `matchmaking.v1.MatchmakingService.GetCandidates`
- `matchmaking.v1.MatchmakingService.SendRequest`
- `matchmaking.v1.MatchmakingService.AcceptRequest`
- `matchmaking.v1.MatchmakingService.DeclineRequest`

#### Observability
- `GET /metrics` — Prometheus metrics + NATS events (NEW)

---

### 4. Chat Service (Port 8083) — 3 HTTP + WebSocket

#### Chat Operations
- `GET /api/v1/chat/rooms/{id}/messages` — Get room messages

#### Internal Endpoints (X-Internal-Token required)
- `POST /api/v1/chat/internal/rooms` — Create chat room
- `POST /api/v1/chat/internal/disconnect` — Disconnect user

#### Real-time Communication
- `WS /ws` — Chat WebSocket (bidirectional)
- `WS /dashboard/chats/ws` — Dashboard WebSocket

#### Service Health
- `GET /api/v1/chat/health` — Health check

#### Observability
- `GET /metrics` — Prometheus metrics

---

### 5. Moderation Service (Port 8084) — 5 HTTP

#### Public Reports
- `POST /api/v1/report` — Create report
- `GET /api/v1/report/reports/{id}` — Get report

#### Internal Moderation (X-Internal-Token required)
- `GET /api/v1/report/reports` — List all reports
- `POST /api/v1/report/moderate/message` — Moderate message

#### Service Health
- `GET /api/v1/report/health` — Health check

#### Observability
- `GET /metrics` — Prometheus metrics

---

### 6. Notification Service (Port 8085) — 3 HTTP

#### Notifications
- `POST /api/v1/notifications/notify` — Send notification (internal)
- `GET /api/v1/notifications/notifications` — Get notifications

#### Service Health
- `GET /api/v1/notifications/health` — Health check

#### Observability
- `GET /metrics` — Prometheus metrics

---

## Endpoint Categories Summary

### By Method
| Method | Count |
|--------|-------|
| GET | 35 |
| POST | 23 |
| PUT | 10 |
| PATCH | 1 |
| DELETE | 3 |
| WebSocket (WS) | 3 |
| **Total** | **75** |

### By Authentication
| Type | Count |
|------|-------|
| Public (no auth) | 18 |
| Authenticated (JWT required) | 35 |
| Internal (X-Internal-Token required) | 10 |
| WebSocket/SSE (real-time) | 7 |
| Health checks | 6 |
| Metrics endpoints | 5 |
| **Total** | **81** |

### By Purpose
| Category | Count |
|----------|-------|
| Authentication | 4 |
| User Management | 15 |
| Matchmaking | 13 |
| Chat/Messaging | 5 |
| Profiles | 8 |
| Requests/Exchanges | 7 |
| Moderation | 4 |
| Notifications | 3 |
| Real-time (WS/SSE) | 5 |
| Health & Monitoring | 6 |
| **Total** | **70** |

---

## Critical Paths (User Journey)

### 1. Skill Profile Setup
1. `POST /api/v1/users/register` — Create account
2. `PUT /api/v1/match/profile` — Set skills
3. `GET /metrics` — Monitor activity

### 2. Finding Matches
1. `GET /api/v1/match/candidates` — Get recommendations
2. `POST /api/v1/match/request` — Send exchange request
3. `WS /ws` — Start chat

### 3. Complete Exchange
1. `POST /api/v1/match/requests/{id}/complete` — Mark complete
2. `POST /api/v1/notifications/notify` — Send notification
3. `GET /api/v1/match/notifications` — Receive confirmation

---

## Infrastructure Points

| Component | Port | Endpoints |
|-----------|------|-----------|
| API Gateway | 8080 | 13 HTTP + 3 WS |
| User Service | 8081 | 20 HTTP + 1 gRPC |
| Matchmaking | 8082 | 23 HTTP + 1 gRPC + 1 SSE |
| Chat Service | 8083 | 3 HTTP + 2 WS |
| Moderation | 8084 | 5 HTTP |
| Notification | 8085 | 3 HTTP |
| Prometheus | 9090 | Metrics scraping (NEW) |
| Grafana | 3001 | Dashboards (NEW) |
| PostgreSQL | 5432 | Database |
| Redis | 6379 | Cache/State |
| NATS | 4222 | Message queue |

---

## Observability Added (Bonus 2)

**New endpoints across all services:**
- `GET /metrics` — 5 services expose Prometheus metrics
- `http://localhost:9090` — Prometheus (scrapes every 5s)
- `http://localhost:3001` — Grafana (dashboards)

**Metrics tracked:**
- `http_requests_total` (3 services)
- `http_request_duration_seconds` (3 services)
- `nats_events_total` (matchmaking)

---

## Total Endpoint Count

```
HTTP Endpoints:       70
WebSocket:             3
Server-Sent Events:    1
gRPC Services:         2
/metrics Endpoints:    5
────────────────────────
GRAND TOTAL:          81
```

**By Service:**
- API Gateway: 13
- User Service: 21 (20 HTTP + 1 gRPC)
- Matchmaking: 24 (23 HTTP + 1 gRPC)
- Chat Service: 4
- Moderation: 6
- Notification: 4
- **TOTAL: 72 service endpoints + 9 infrastructure**
