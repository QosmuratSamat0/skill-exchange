# Architecture Quick Reference - Visual Guide

## System Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                          FRONTEND TIER                           │
│                    Next.js Web (localhost:3000)                  │
└─────────────────────────────┬──────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│                    🔐 API GATEWAY (8080)                        │
│                                                                  │
│  • JWT authentication                                            │
│  • Rate limiting (Redis)                                         │
│  • HTTP routing                                                  │
│  • BFF endpoints                                                 │
│  • WebSocket proxy                                               │
│                                                                  │
│  Middleware: [Auth] → [RateLimit] → [Tracing] → [Metrics]      │
└──────────────────┬──────────────────────────────────────────────┘
                   │
        ┌──────────┼──────────┬──────────┬──────────┐
        │          │          │          │          │
        ▼          ▼          ▼          ▼          ▼
    ┌────────┐ ┌──────────┐ ┌────────┐ ┌──────────┐ ┌────────────┐
    │ 👤     │ │ 🎯       │ │ 💬     │ │ ⚠️       │ │ 📧         │
    │ USER   │ │ MATCH    │ │ CHAT   │ │ MODERATE │ │NOTIF       │
    │(8081)  │ │(8082)    │ │(8083)  │ │(8084)    │ │(8085)      │
    └───┬────┘ └───┬──────┘ └───┬────┘ └──────────┘ └────────────┘
        │          │            │
        └────┬─────┴────┬───────┘
             │          │
            ▼          ▼
        ┌─────────┐ ┌──────────┐
        │ 🗄️  DB  │ │ ⚡ CACHE │
        │Postgres │ │ Redis    │
        │ (5432)  │ │ (6379)   │
        └─────────┘ └──────────┘
                    
        ┌──────────────────────┐
        │ 📨 MESSAGE QUEUE     │
        │ NATS JetStream       │
        │ (4222)               │
        │ • exchange.triggered │
        │ • exchange.completed │
        └──────────────────────┘
```

---

## Service Communication Map

```
┌─────────────────────────────────────────────────────────┐
│               COMMUNICATION PROTOCOLS                   │
└─────────────────────────────────────────────────────────┘

HTTP (REST)
├─ API Gateway ↔ Client (external API)
└─ Service ↔ Service (when gRPC not available)

gRPC (Protocol Buffers - Fast & Typed)
├─ API Gateway → User Service (frequent calls)
├─ API Gateway → Matchmaking Service (frequent calls)
└─ Internal optimization (10x faster than REST)

WebSocket (Bidirectional Real-time)
├─ Client ↔ Chat Service (messages)
├─ Client ↔ Matchmaking Service (notifications via SSE)
└─ Sub-100ms latency

NATS JetStream (Async Publish-Subscribe)
├─ Matchmaking → Notification (events)
├─ Durable delivery (no message loss)
└─ Loose coupling (independent services)

Database
├─ User Service → PostgreSQL (persistent data)
├─ Matchmaking → Redis (fast state)
├─ Chat → PostgreSQL (message history)
└─ Notification → PostgreSQL (tracking)
```

---

## Data Storage Decision Tree

```
Need to store: X

Is it frequently read (>1000/sec)?
├─ YES → Redis (in-memory cache)
│        ├─ User profiles? No, use DB
│        ├─ Request state? YES → Redis
│        └─ Candidates index? YES → Redis
│
├─ NO → Continue...

Is it relational/complex queries?
├─ YES → PostgreSQL (SQL)
│        ├─ User accounts? YES
│        ├─ Messages? YES
│        ├─ Notifications? YES
│        └─ Reports? YES
│
└─ NO → Evaluate based on size/structure
```

---

## Authentication Flow

```
┌──────────────────────────────────────────────────────────┐
│              JWT Authentication Flow                    │
└──────────────────────────────────────────────────────────┘

1. REGISTRATION
   POST /api/v1/users/register
   {email, password} ──→ User Service
                        └─→ Hash password (bcrypt)
                        └─→ Store in PostgreSQL
                        └─→ Generate JWT (15 min)
                        └─→ Generate Refresh (7 day)
                        └─← Return {access_token, refresh_token}

2. AUTHENTICATED REQUEST
   GET /api/v1/users/me
   Headers: Authorization: Bearer <JWT>
           │
           ▼
   API Gateway
   ├─ Verify JWT signature
   ├─ Check expiry
   ├─ Extract user_id
   ├─ Pass to User Service (gRPC)
   │  └─→ Get user data
   │  └─← Return user object
   └─← Send response to client

3. TOKEN REFRESH
   POST /api/v1/users/refresh
   {refresh_token} ──→ User Service
                      └─→ Verify refresh token
                      └─→ Generate new access token
                      └─← Return new access_token

4. LOGOUT
   POST /api/v1/users/logout
   ──→ Invalidate refresh token
   └─← Client removes token from storage
```

---

## Exchange Request State Machine

```
                    ┌────────────┐
                    │  PENDING   │ ← Sender created request
                    └─────┬──────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
    ┌────────┐       ┌──────────┐     ┌─────────────┐
    │DECLINED│  →    │ACCEPTED  │ →   │IN_PROGRESS  │
    │        │       │          │     │             │
    └────────┘       └────┬─────┘     └────┬────────┘
                          │                │
                          ▼                ▼
                    ┌──────────────────────────────┐
                    │  User1 clicks "Complete"     │
                    │  Set sender_confirmed=true   │
                    │  Publish: exchange.triggered │
                    └──────────────┬───────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
                    ▼                             ▼
            ┌────────────────┐          ┌─────────────────┐
            │User2 gets email│          │Notification sent│
            │"Confirm please"│          │to User2 inbox   │
            └────────────────┘          └─────────────────┘
                                               │
                                               ▼
                                    ┌────────────────────┐
                                    │ User2 clicks       │
                                    │ "Complete"         │
                                    │ Both flags TRUE?   │
                                    └────────┬───────────┘
                                             │
                                    ┌────────▼────────┐
                                    │   COMPLETED ✅   │
                                    │Publish: exchange │
                                    │.completed        │
                                    └──────────────────┘
```

---

## Request Lifecycle: "Send Exchange Request"

```
1. CLIENT REQUEST
   ┌─────────────────────────────────────┐
   │ POST /api/v1/match/request          │
   │ Body: {recipient_id: "user2"}       │
   │ Headers: Authorization: Bearer <JWT>│
   └────────────┬────────────────────────┘
                │
                ▼
   
2. API GATEWAY (8080)
   ┌─────────────────────────────────────┐
   │ ✓ Validate JWT token                │
   │ ✓ Extract user_id from token        │
   │ ✓ Check rate limit (Redis)          │
   │ ✓ Route to Matchmaking Service      │
   │ ✓ Call via gRPC                     │
   └────────────┬────────────────────────┘
                │
                ▼
   
3. MATCHMAKING SERVICE (8082)
   ┌─────────────────────────────────────┐
   │ ✓ Verify sender & recipient exist   │
   │ ✓ Check not already connected       │
   │ ✓ Create request object             │
   │ ✓ Store in Redis                    │
   │   Key: pairexx:request:req_uuid     │
   │   Status: PENDING                   │
   │ ✓ Publish NATS event                │
   │   Topic: exchange.initiated         │
   │ ✓ Return request_id                 │
   └────────────┬────────────────────────┘
                │
                ▼
   
4. NOTIFICATION SERVICE (8085)
   ┌─────────────────────────────────────┐
   │ (Asynchronously listening to NATS)  │
   │ ✓ Receive exchange.initiated event  │
   │ ✓ Fetch user preferences            │
   │ ✓ Check: Want email notification?   │
   │ ✓ Create in-app notification        │
   │ ✓ Send email via Gmail SMTP         │
   │ ✓ Mark message as acknowledged      │
   └────────────┬────────────────────────┘
                │
                ▼
   
5. CLIENT UPDATES (SSE or WebSocket)
   ┌─────────────────────────────────────┐
   │ GET /api/v1/match/notifications     │
   │ (Server-Sent Events stream)         │
   │ ← Recipient's browser receives      │
   │   "New request from user1!"         │
   │ ← UI badge updates in real-time     │
   │ ← Browser notification sound/toast  │
   └─────────────────────────────────────┘

TIMELINE:
  T=0ms:   Client clicks "Send request"
  T=10ms:  Validated & routed
  T=20ms:  Request stored in Redis
  T=25ms:  Event published to NATS
  T=30ms:  Notification service processes
  T=100ms: Email sent (async)
  T=200ms: Recipient browser updates (SSE)
  T=500ms: Recipient sees email (Gmail delay)
```

---

## Matching Algorithm: Redis SINTER

```
User A Profile (in Redis):
  i_have: ["Go", "Python", "Docker"]      (skills A can teach)
  i_want: ["React", "Node.js"]            (skills A wants to learn)

User B Profile (in Redis):
  i_have: ["React", "Node.js"]            (skills B can teach)
  i_want: ["Go", "Docker"]                (skills B wants to learn)

MATCHING ALGORITHM:
  Find users where:
    (User.i_have ∩ MyProfile.i_want) AND
    (User.i_want ∩ MyProfile.i_have) ≠ ∅

  Redis SINTER implementation:
    SINTER \
      pairexx:has:React pairexx:has:Node.js \    (who has what A wants)
      pairexx:wants:Go pairexx:wants:Docker      (who wants what A has)
    
    Result: {"user_b", ...other matches}

RESULT:
  ✓ User B is a perfect match (can teach what A wants, wants what A has)
  ✓ Show A → B as a candidate
  ✓ Show B → A as a candidate

COMPLEXITY:
  SQL approach: O(N²) - scan all users
  Redis SINTER: O(N×M) where N=users, M=skills
  ✅ 100x faster for typical use cases
```

---

## Failure Scenarios & Recovery

```
SCENARIO 1: Chat Service Crashes
├─ Effect: Users can't access chat
├─ Other services: UNAFFECTED
│  └─ Users can still find matches
│  └─ Notifications still send
├─ Detection: API Gateway health check fails
├─ Recovery: 
│  └─ Chat service restarts
│  └─ Messages in DB preserved
│  └─ Users reconnect automatically
└─ Data loss: NONE (persisted in PostgreSQL)

SCENARIO 2: Redis Crashes
├─ Effect: Matchmaking reads SLOW
├─ Other services: Working (fallback to DB)
├─ Detection: Redis connection fails
├─ Recovery:
│  └─ Redis restarts
│  └─ Rebuild from PostgreSQL
└─ Data loss: Request state rebuilt from DB

SCENARIO 3: NATS Goes Down
├─ Effect: Notifications queue up
├─ Other services: Working (just delayed)
├─ Detection: NATS unavailable
├─ Recovery:
│  └─ NATS restarts
│  └─ All queued messages delivered
│  └─ Durable consumer retries
└─ Data loss: NONE (JetStream persists to disk)

SCENARIO 4: PostgreSQL Crashes
├─ Effect: User Service unavailable
├─ Other services: Cache mostly works
├─ Detection: DB connection fails
├─ Recovery:
│  └─ Database restarts
│  └─ Transactions ensure consistency
│  └─ Restore from backup if needed
└─ Data loss: Depends on backup strategy

DESIGN: Cascading failures prevented
  ✓ Each service independent
  ✓ Async with NATS prevents blocking
  ✓ Circuit breakers (timeout on slow services)
  ✓ Graceful degradation (read cache if DB slow)
```

---

## Performance Characteristics

```
METRIC                      VALUE           WHY
────────────────────────────────────────────────────────
Request latency (p95):      ~50ms           gRPC + caching
JWT validation:             <1ms            Local signature check
Candidate search:           ~5ms            Redis SINTER
Message delivery (WS):      <100ms          WebSocket real-time
DB query (indexed):         ~10-30ms        PostgreSQL indexing
Email send:                 ~1-5 sec        SMTP async
────────────────────────────────────────────────────────

SCALING:
  ✓ 1000 users:    1 server each
  ✓ 10K users:     2-3 servers each
  ✓ 100K users:    5-10 servers each
  ✓ 1M users:      Add service replicas + load balance

BOTTLENECK ANALYSIS:
  Most likely: Database (PostgreSQL)
  Fix: Read replicas, connection pooling
  
  Second: WebSocket memory (Chat Service)
  Fix: Distributed session (Redis)
  
  Third: Email (Notification)
  Fix: Already async - not blocking
```

---

## Defense Presentation Structure

```
OPENING (1 min)
├─ What is Pairexx?
├─ 6 microservices, 70+ endpoints
└─ Enable skill exchange between users

ARCHITECTURE (2 min)
├─ API Gateway as entry point
├─ Service separation by concern
└─ Technology choices justified

DATA FLOW (2 min)
├─ Show: User registers → finds match → exchanges
├─ Technologies at each step
└─ Why that technology was chosen

KEY DECISIONS (2 min)
├─ Redis for matching (speed + SINTER)
├─ PostgreSQL for durability
├─ NATS for loose coupling
├─ gRPC for performance
└─ Microservices for scaling

RESILIENCE (1 min)
├─ Failure isolation
├─ Automatic retries
├─ Graceful degradation
└─ Zero data loss

DEMO (2 min)
├─ Show /metrics dashboard
├─ Live Grafana metrics
├─ API response times
└─ Error handling

QUESTIONS (remaining time)
└─ Ready to answer
```
