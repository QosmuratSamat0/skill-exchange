# Pairexx Architecture Defense Guide

## System Overview

Pairexx is a **microservices-based skill exchange platform** with 6 independent services communicating via HTTP, gRPC, NATS, and WebSocket.

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT TIER                          │
│  Web (React/Next.js) @ localhost:3000                       │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                   API GATEWAY (8080)                        │
│  • HTTP reverse proxy to all services                       │
│  • JWT authentication & authorization                       │
│  • Rate limiting (Redis-backed)                             │
│  • BFF (Backend-for-Frontend) routes                        │
│  • gRPC client for user/matchmaking                         │
└──────────────────────┬──────────────────────────────────────┘
        │
        ├──────────────────┬──────────────────┬──────────────┐
        │                  │                  │              │
        ▼                  ▼                  ▼              ▼
   ┌────────────┐   ┌──────────────┐  ┌────────────┐  ┌────────────┐
   │   USER     │   │ MATCHMAKING  │  │    CHAT    │  │ MODERATION │
   │  SERVICE   │   │   SERVICE    │  │  SERVICE   │  │  SERVICE   │
   │   (8081)   │   │    (8082)    │  │   (8083)   │  │   (8084)   │
   └────┬───────┘   └──────┬───────┘  └────┬───────┘  └────────────┘
        │                  │               │
        └──────────────────┼───────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
   ┌─────────┐        ┌──────────┐     ┌────────────────┐
   │PostgreSQL      │  Redis    │     │ NATS JetStream │
   │(5432)          │  (6379)   │     │    (4222)      │
   └─────────┘        └──────────┘     └────────────────┘
                                              │
                                              ▼
                                     ┌────────────────────┐
                                     │ NOTIFICATION       │
                                     │ SERVICE (8085)     │
                                     │ SMTP Worker        │
                                     └────────────────────┘
```

---

## Architecture Pattern: Clean Architecture + Microservices

### Core Design Principles

1. **Separation of Concerns** - Each service owns its domain
2. **Bounded Contexts** - Services communicate only through APIs
3. **Independent Scaling** - Services scale independently
4. **Resilience** - Failure in one service doesn't crash others
5. **Observable** - Metrics, logging, tracing on all services

---

## How Each Service Works

### 1. API Gateway (Port 8080) - The Entry Point

**What it does:**
- Single entry point for all client requests
- Routes HTTP requests to appropriate backend services
- Handles authentication and rate limiting
- Acts as BFF (Backend-for-Frontend) for some endpoints

**How it works:**
```
Client Request → API Gateway → 
  ├─ Check JWT token (auth middleware)
  ├─ Check rate limit (Redis)
  ├─ Route to service (proxy or gRPC)
  └─ Return response
```

**Key routes:**
```
/api/v1/health        → health check
/api/v1/users/*       → User Service (gRPC)
/api/v1/match/*       → Matchmaking Service (gRPC)
/api/v1/chat/*        → Chat Service (HTTP proxy)
/api/v1/report/*      → Moderation Service (HTTP proxy)
/api/v1/notifications/* → Notification Service (HTTP proxy)
/ws, /dashboard/chats/ws → Chat WebSocket (proxy)
```

**Defense points:**
✅ Single point of entry for security
✅ Rate limiting prevents abuse
✅ JWT validation happens once
✅ Middleware stack is clean and reusable
✅ Metrics tracked at gateway level (see all requests)

---

### 2. User Service (Port 8081) - Authentication & Profiles

**What it does:**
- User registration, login, JWT management
- User profile management
- Session tracking
- Ban management (for moderation)

**How it works:**

```
Registration flow:
1. POST /users/register { email, password }
2. Hash password with bcrypt
3. Store in PostgreSQL
4. Return JWT tokens (access + refresh)

Login flow:
1. POST /users/login { email, password }
2. Verify password against hash
3. Generate new JWT (with TTL: 15 min)
4. Generate refresh token (with TTL: 7 days)
5. Cache session in Redis
6. Return both tokens

Profile update flow:
1. GET /users/me (requires JWT)
2. Extract user ID from JWT header
3. Query PostgreSQL
4. Update profile
5. Invalidate Redis cache
```

**Technology choices:**
- PostgreSQL: persistent user data (ACID compliance needed)
- Redis: session caching (fast lookups)
- bcrypt: password hashing (salted, slow-by-design)
- JWT: stateless auth (no session DB needed)

**Defense points:**
✅ Passwords hashed, never stored plaintext
✅ JWT allows stateless auth (scales horizontally)
✅ Redis session cache prevents DB hammering
✅ Email preferences stored (GDPR compliance)
✅ Ban system for problematic users
✅ gRPC interface for internal service-to-service calls

---

### 3. Matchmaking Service (Port 8082) - The Core Logic

**What it does:**
- User skill profiles (Redis)
- Smart candidate matching (SINTER algorithm)
- Exchange request lifecycle
- Completion voting system
- Real-time notifications (SSE)

**How it works:**

#### Skill Profile Storage (Redis)
```
Key structure:
  pairexx:profile:user123 → {
    id: "user123",
    i_have: ["Go", "Python"],    // skills I can teach
    i_want: ["React", "Node.js"], // skills I want to learn
    online: true
  }

Indexes:
  pairexx:skills:Go → {user1, user2, user3}       // who has this skill
  pairexx:wants:React → {user1, user5, user8}     // who wants this skill
```

#### Candidate Matching (Redis SINTER)
```
Query: Find users who have skills I want AND want skills I have

SQL equivalent:
  SELECT * FROM profiles
  WHERE i_have INTERSECT user.i_want
  AND i_want INTERSECT user.i_have

Redis implementation:
  SINTER pairexx:has:React pairexx:wants:Go
  → Returns users who have React AND want Go
```

#### Exchange Request Lifecycle
```
State machine:
  PENDING → ACCEPTED → IN_PROGRESS → COMPLETED
            └─→ DECLINED
            └─→ CANCELLED
```

**State storage in Redis:**
```
Key: pairexx:request:req123 → {
  id: "req123",
  sender_id: "user1",
  recipient_id: "user2",
  status: "ACCEPTED",
  sender_confirmed_complete: false,    // atomic flag
  recipient_confirmed_complete: false, // atomic flag
  created_at: 1234567890,
  updated_at: 1234567890
}
```

#### Completion Voting Flow
```
Step 1: User1 clicks "Complete exchange"
  ├─ Set pairexx:request:req123:sender_confirmed = true
  ├─ Publish NATS event: exchange.completion_triggered
  └─ Notification service sends email to User2

Step 2: User2 clicks "Complete exchange"
  ├─ Set pairexx:request:req123:recipient_confirmed = true
  ├─ Atomic check: both flags true?
  ├─ If yes: Set status = COMPLETED
  ├─ Publish NATS event: exchange.completed
  └─ Notification service sends confirmation to both
```

**Why Redis for requests?**
- ✅ Atomic operations (SET with NX/XX flags)
- ✅ TTL auto-expiration (cleanup old requests)
- ✅ Fast reads/writes (in-memory)
- ✅ Transactions (MULTI/EXEC)

**Defense points:**
✅ Redis SINTER for O(N) matching (efficient)
✅ State machine ensures valid transitions
✅ Atomic operations prevent race conditions
✅ NATS decouples matchmaking from notifications
✅ SSE for real-time client updates
✅ gRPC for high-performance internal calls

---

### 4. Chat Service (Port 8083) - Real-time Messaging

**What it does:**
- Create chat rooms between matched users
- Store messages in PostgreSQL
- Real-time message delivery via WebSocket
- Presence/typing indicators

**How it works:**

#### WebSocket Hub Pattern
```
┌─────────────────────────────────────────┐
│        WebSocket Hub (In-Memory)        │
│  Map[RoomID][]WebSocketConnection       │
└────────────────┬────────────────────────┘
                 │
    ┌────────────┼────────────┐
    │            │            │
    ▼            ▼            ▼
User1-WS    User2-WS    User3-WS
(room123)   (room123)   (room456)
```

#### Message Flow
```
1. User sends message via WebSocket
2. Hub receives message
3. Store in PostgreSQL (durable)
4. Broadcast to all users in room
5. Real-time delivery (< 100ms)
6. Client updates UI immediately
```

#### Room Creation Flow
```
Internal endpoint: POST /internal/rooms
Input: { user1_id, user2_id, exchange_id }
Output: room_id

Process:
1. Check both users exist (via User Service)
2. Create room in PostgreSQL
3. Return room_id
4. Client connects: WS /ws?room=room_id&user=user1
```

**Why WebSocket?**
- ✅ Bidirectional (server → client push)
- ✅ Persistent connection (lower latency)
- ✅ Compared to polling (efficient)

**Defense points:**
✅ Hub pattern for memory efficiency
✅ PostgreSQL for message persistence
✅ Real-time delivery < 100ms
✅ Origin checking (prevent CSRF)
✅ User validation on connection
✅ Graceful disconnect handling

---

### 5. Moderation Service (Port 8084) - Safety

**What it does:**
- User reports (spam, harassment, etc.)
- Automated message moderation
- Ban/unban users

**How it works:**

#### Report Workflow
```
1. User submits report:
   POST /report {
     reported_user_id,
     reason,
     message_id (optional)
   }

2. Store in PostgreSQL
   
3. Automated checks:
   - Spam keywords
   - Inappropriate content
   - Report frequency

4. Escalate to admin if needed

5. Ban if threshold exceeded:
   POST /internal/ban {user_id}
   → Updates User Service
   → Prevents login
```

**Defense points:**
✅ Persistent audit trail (PostgreSQL)
✅ Automated filtering for common abuse
✅ Manual review capability
✅ Ban system prevents future harm

---

### 6. Notification Service (Port 8085) - Async Work

**What it does:**
- Sends notifications (in-app + email)
- Processes NATS JetStream events
- Gmail SMTP worker

**How it works:**

#### NATS Event Architecture
```
Matchmaking Service publishes:
  exchange.completion_triggered → 
    {sender_id, recipient_id, exchange_id}

Notification Service subscribes:
  (durable consumer = reliable delivery)
  
  ├─ Check user preferences (User Service)
  ├─ Create in-app notification (PostgreSQL)
  ├─ Send email (Gmail SMTP)
  ├─ Mark message acknowledged
  └─ Move to next event
```

#### NATS vs HTTP for this use case?
```
❌ HTTP would be:
  ├─ Blocking (matchmaking waits for response)
  ├─ Failure sensitive (crashes if SMTP down)
  └─ Tight coupling (notification logic in matchmaking)

✅ NATS provides:
  ├─ Async (fire and forget)
  ├─ Resilient (retries automatically)
  ├─ Decoupled (notification logic separate)
  ├─ Durable consumers (no message loss)
  ├─ Multiple subscribers (scalable)
```

**Defense points:**
✅ Async processing prevents blocking
✅ NATS guarantees delivery (JetStream)
✅ Loose coupling (services independent)
✅ Email template system (customizable)
✅ User preference respect (privacy)

---

## Communication Patterns

### 1. HTTP (REST) - Stateless Requests
```
Client → API Gateway → Services
Example: POST /api/v1/match/request
```
**When used:**
- Request-response operations
- External APIs
- Simple queries

---

### 2. gRPC - Fast Internal Calls
```
API Gateway → User Service (gRPC)
Example: UserService.GetUser(user_id)

Why gRPC?
✅ 7x faster than REST (Protocol Buffers)
✅ Strongly typed (no JSON parsing errors)
✅ Bidirectional streaming (if needed)
✅ Connection pooling
```

**Defense points:**
- gRPC used for frequent, latency-sensitive calls
- REST used for external/infrequent calls
- Clear separation of concerns

---

### 3. WebSocket - Bidirectional Real-time
```
Client ←→ Chat Service WebSocket
Example: Message delivery < 100ms
```

---

### 4. NATS JetStream - Async Messaging
```
Matchmaking → NATS → Notification Service
Example: event: exchange.completed
```

---

## Data Flow: Complete User Journey

### Journey: "Find a match and complete exchange"

```
STEP 1: USER REGISTERS
┌─────────────────────────────────────────┐
│ 1. POST /api/v1/users/register          │
│    → API Gateway                        │
│    → User Service (HTTP)                │
│    → PostgreSQL (store user)            │
│    ← Return JWT token                   │
└─────────────────────────────────────────┘

STEP 2: SET SKILL PROFILE
┌─────────────────────────────────────────┐
│ 1. PUT /api/v1/match/profile            │
│    { i_have: ["Go"], i_want: ["React"]} │
│    → API Gateway (JWT auth)             │
│    → Matchmaking Service (gRPC)         │
│    → Redis (store profile + indexes)    │
│    ← Return 200 OK                      │
└─────────────────────────────────────────┘

STEP 3: FIND CANDIDATES
┌─────────────────────────────────────────┐
│ 1. GET /api/v1/match/candidates         │
│    → API Gateway (JWT auth)             │
│    → Matchmaking Service (gRPC)         │
│    → Redis SINTER query                 │
│    → Get matching user profiles         │
│    ← Return candidate list              │
└─────────────────────────────────────────┘

STEP 4: SEND EXCHANGE REQUEST
┌─────────────────────────────────────────┐
│ 1. POST /api/v1/match/request           │
│    { recipient_id: "user2" }            │
│    → API Gateway (JWT auth)             │
│    → Matchmaking Service (gRPC)         │
│    → Redis (store request state)        │
│    ← Return request_id                  │
│ 2. Recipient gets SSE notification      │
│    GET /api/v1/match/notifications (SSE)│
└─────────────────────────────────────────┘

STEP 5: RECIPIENT ACCEPTS
┌─────────────────────────────────────────┐
│ 1. POST /api/v1/match/request/{id}/accept
│    → Matchmaking Service (gRPC)         │
│    → Update Redis request status        │
│    → Publish NATS: request.accepted     │
│ 2. Notification Service processes event │
│    → User Service (get email)           │
│    → Send email: "Match accepted!"      │
└─────────────────────────────────────────┘

STEP 6: CREATE CHAT ROOM
┌─────────────────────────────────────────┐
│ 1. Internal call: POST /internal/rooms  │
│    { user1_id, user2_id, exchange_id }  │
│    → Chat Service                       │
│    → PostgreSQL (create room)           │
│    ← Return room_id                     │
│ 2. Client connects: WS /ws?room=room123 │
│    → WebSocket Hub manages connection   │
└─────────────────────────────────────────┘

STEP 7: EXCHANGE MESSAGES
┌─────────────────────────────────────────┐
│ 1. User1 sends message via WebSocket    │
│    → Hub receives                       │
│    → PostgreSQL (store message)         │
│    → Broadcast to User2 (< 100ms)       │
│    ← Real-time delivery                 │
└─────────────────────────────────────────┘

STEP 8: COMPLETE EXCHANGE
┌─────────────────────────────────────────┐
│ 1. User1 clicks "Complete exchange"     │
│    POST /api/v1/match/requests/{id}/complete
│    → Matchmaking Service (gRPC)         │
│    → Redis: set sender_confirmed=true   │
│    → Publish NATS: exchange.trigger     │
│ 2. Notification Service:                │
│    → Send email to User2: "Confirm!"    │
│    → Create in-app notification         │
│ 3. User2 clicks "Complete exchange"     │
│    → Redis: set recipient_confirmed=true
│    → Check both flags true?             │
│    → Yes! Set status=COMPLETED          │
│    → Publish NATS: exchange.completed   │
│ 4. Final notifications to both users    │
└─────────────────────────────────────────┘

STEP 9: FIND SKILLS PAGE SHOWS STATUS
┌─────────────────────────────────────────┐
│ 1. GET /api/v1/match/candidates         │
│    → Matchmaking Service                │
│    → Status = "Обмен успешно завершен"  │
│    → UI renders completion badge        │
└─────────────────────────────────────────┘
```

---

## How to Defend Each Decision

### Q: "Why microservices instead of monolith?"

**Answer:**
- Each service has different scaling needs:
  - Chat (WebSocket) needs different infra than User (HTTP)
  - Matchmaking (Redis heavy) vs Notification (I/O heavy)
- Independent deployment (changes don't require full build)
- Technology flexibility (Chat could use Node.js, Matchmaking uses Go)
- Team scalability (different teams own different services)
- Failure isolation (Notification crash doesn't kill Chat)

---

### Q: "Why Redis for matchmaking instead of PostgreSQL?"

**Answer:**
- **Speed**: O(1) set operations vs O(N) SQL queries
- **SINTER algorithm**: Built-in set intersection (Redis primitive)
- **TTL**: Auto-expiration of old requests (no cleanup job)
- **Atomic operations**: No need for transactions/locks
- **Real-time**: Memory-based (no disk I/O)
- **Scale**: Horizontal with clustering

**Comparison:**
```
PostgreSQL: SELECT * FROM profiles WHERE i_have && user.i_want
  → Complex query
  → Indexes needed
  → Network round trip
  → Slower

Redis: SINTER pairexx:has:* pairexx:wants:*
  → O(N) operation
  → In-memory
  → Sub-millisecond
```

---

### Q: "Why NATS for notifications instead of direct HTTP calls?"

**Answer:**
- **Async**: Matchmaking doesn't wait for email
- **Resilient**: NATS retries automatically
- **Loose coupling**: Notification logic separate
- **Durable**: Messages persist until consumed
- **Scalable**: Multiple notification services can subscribe
- **Failure isolated**: SMTP down ≠ matchmaking down

**Flow:**
```
❌ Bad (synchronous):
Matchmaking.CompleteExchange() {
  → send HTTP to Notification
  → wait for response
  → block if Notification slow
  → fail if Notification crashes
}

✅ Good (async):
Matchmaking.CompleteExchange() {
  → publish event to NATS
  → return immediately
  → Notification subscribes when ready
  → automatic retry if fails
}
```

---

### Q: "Why JWT instead of session cookies?"

**Answer:**
- **Stateless**: No session DB needed (scales horizontally)
- **Mobile-friendly**: Works with SPA/mobile apps
- **CORS-friendly**: Can work cross-domain
- **Microservices**: Each service validates without DB query
- **Refresh tokens**: Long-lived access + short-lived refresh

**Flow:**
```
Session Cookie:
  Request → Server → Check DB → Query user → Validate
  (DB hit on every request)

JWT:
  Request → Check signature locally → Validate
  (No DB needed, faster)
```

---

### Q: "Why gRPC for internal calls?"

**Answer:**
- **Performance**: Protocol Buffers (7x faster than JSON)
- **Type safety**: Strongly typed contracts
- **Connection pooling**: Persistent connections
- **Streaming**: Bidirectional if needed

**Example:**
```
REST: POST /api/v1/users/bff/me
  → JSON parsing
  → HTTP overhead
  → ~50-100ms

gRPC: UserService.GetUser(user_id)
  → Binary protocol
  → Connection reused
  → ~5-10ms (10x faster)
```

---

### Q: "Why PostgreSQL for some services and Redis for others?"

**Answer:**

| Need | Storage | Why |
|------|---------|-----|
| Durable user data | PostgreSQL | ACID, backups, recovery |
| Messages | PostgreSQL | Query history, search |
| Session state | Redis | Fast, TTL auto-cleanup |
| Request lifecycle | Redis | Atomic flags, speed |
| Reports | PostgreSQL | Audit trail, complex queries |
| Notifications | PostgreSQL | Delivery tracking |

---

### Q: "How do you ensure data consistency across services?"

**Answer:**

1. **Event Sourcing**: 
   - NATS events are immutable log
   - Services can replay history

2. **Eventual Consistency**:
   - Exchange status in Redis (source of truth)
   - Notifications async (eventually consistent)
   - User sees final state after all events processed

3. **Atomic Operations**:
   - Redis transactions for critical updates
   - PostgreSQL transactions for complex operations

4. **Compensation Transactions**:
   - If notification fails, retry logic in NATS
   - Never leaves partial state

---

### Q: "What about service-to-service authentication?"

**Answer:**
- All internal endpoints require `X-Internal-Token`
- Token is environment variable (secret)
- Requests without token are rejected
- Combined with API Gateway rate limiting

```
Internal endpoint:
  POST /internal/ban (requires X-Internal-Token)
  
Validation:
  1. Check header presence
  2. Compare with env var
  3. Only admin/internal calls allowed
```

---

### Q: "How do you handle failures?"

**Answer:**

| Failure | Handling |
|---------|----------|
| Service crash | Independent, doesn't affect others |
| Network timeout | Retry logic with exponential backoff |
| NATS down | Messages queue, deliver when up |
| PostgreSQL down | Read-only mode or fail gracefully |
| Redis down | Fall back to in-memory cache |
| SMTP down | Retry, store in queue |

---

### Q: "How is performance optimized?"

**Answer:**

1. **Caching**: Redis for frequent queries
2. **Connection pooling**: PgxPool, Redis pipeline
3. **Compression**: gRPC Protocol Buffers
4. **Async**: NATS for non-blocking operations
5. **Rate limiting**: Prevent thundering herd
6. **Metrics**: Monitor and alert on slow queries

---

## Key Architectural Benefits

### 1. **Scalability**
- Services scale independently
- Horizontal: Add more instances
- Vertical: More resources per instance
- Example: Chat WebSocket needs more memory, Matchmaking needs more CPU

### 2. **Resilience**
- Failure isolation (one service down ≠ whole system)
- Circuit breakers (if service slow, skip it)
- Graceful degradation (show cached data)

### 3. **Maintainability**
- Small codebases (easier to understand)
- Independent deployments (less risk)
- Clear API contracts (gRPC, REST)

### 4. **Developer Experience**
- Different teams can work independently
- Services can use different languages (Go, Node, Python)
- Faster feedback loops (small tests)

### 5. **Observability**
- Centralized metrics (Prometheus + Grafana)
- Structured logging (all services same format)
- Distributed tracing (follow request across services)

---

## Summary: How to Present During Defense

### Opening:
"Pairexx is a distributed microservices platform where 6 independent services collaborate through well-defined APIs to enable skill exchange between users."

### Core Services:
1. **API Gateway** - Single entry point, security
2. **User Service** - Auth, profiles
3. **Matchmaking** - Smart matching, exchange lifecycle
4. **Chat** - Real-time messaging
5. **Moderation** - Safety
6. **Notification** - Async worker

### Communication:
- **REST**: External-facing APIs
- **gRPC**: Internal high-performance calls
- **WebSocket**: Real-time bidirectional
- **NATS**: Async event-driven

### Key Design Decisions:
- Redis for matchmaking (speed + SINTER algorithm)
- PostgreSQL for durability
- JWT for stateless auth
- NATS for loose coupling
- Microservices for independent scaling

### Data Flow Example:
"User finds a match, sends request, recipient accepts, they chat, complete exchange. Each step uses appropriate technology: Redis for state, PostgreSQL for persistence, NATS for notifications."

### Why This Architecture Matters:
- ✅ Scales to millions of users
- ✅ Resilient (one failure doesn't crash all)
- ✅ Maintainable (clear boundaries)
- ✅ Observable (metrics on everything)
- ✅ Flexible (easy to add new services)
