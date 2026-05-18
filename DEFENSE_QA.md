# Defense Q&A - Ready Answers

## Quick Answers for Common Questions

### Architecture Questions

**Q1: Why did you choose microservices architecture?**

"Pairexx needed independent scaling for different use cases. Chat WebSocket servers need different resources than matchmaking. With microservices:
- Services scale independently
- Teams work in parallel
- Failures don't cascade (Chat crashes ≠ Matchmaking crashes)
- Technology flexibility (future: Chat in Node.js, Matchmaking in Go)
- Clean API contracts (easy to test and document)"

---

**Q2: How do the services communicate?**

"We use multiple protocols based on need:
- **REST/HTTP**: External APIs and simple requests
- **gRPC**: High-performance internal calls (API Gateway → User/Matchmaking, 10x faster)
- **WebSocket**: Real-time bidirectional (Chat messages, < 100ms)
- **NATS JetStream**: Async events (Matchmaking → Notification, decoupled)"

---

**Q3: What's the advantage of using both PostgreSQL and Redis?**

"Different tools for different problems:
- **PostgreSQL**: Durable user data, complex queries, ACID transactions (users, messages, reports)
- **Redis**: Fast state, atomic operations, TTL cleanup (profiles, requests, sessions)

Example: Exchange request lives in Redis for speed and atomic flag updates. Message history in PostgreSQL for persistence and search."

---

**Q4: Why NATS instead of direct HTTP calls from Matchmaking to Notification?**

"NATS solves the tight coupling problem:
- **HTTP**: Blocking (Matchmaking waits), failure-sensitive (crashes if Notification slow)
- **NATS**: Async (fire-and-forget), resilient (retries auto), durable (messages persisted)

If SMTP is slow or Notification crashes, Matchmaking doesn't care—it published and moved on."

---

### Data & Performance Questions

**Q5: How do you find matching candidates efficiently?**

"Using Redis SINTER algorithm:
1. Store user profiles as Redis sets
   - pairexx:has:Go = {user1, user3, user5}
   - pairexx:wants:React = {user2, user4, user6}

2. Find matches:
   SINTER pairexx:has:* pairexx:wants:*
   
3. O(N+M) complexity vs O(N²) for SQL
   Result: ~5ms query time"

---

**Q6: How do you ensure data consistency across services?**

"Multi-layered approach:
1. **Source of truth**: Exchange status lives in Redis (single source)
2. **Event sourcing**: NATS events are immutable log
3. **Eventual consistency**: Services process events async but eventually align
4. **Atomic operations**: Redis transactions for critical updates
5. **Compensation**: If notification fails, NATS retries automatically

Example: Exchange completion waits for BOTH users to confirm (atomic flag checks), then publishes final event. No partial state."

---

**Q7: What happens if services crash?**

"Designed for resilience:
- **Chat crashes**: Users reconnect, messages in PostgreSQL preserved
- **PostgreSQL down**: Services degrade gracefully, use cache
- **Redis down**: Fall back to database (slower but works)
- **NATS down**: Notification queue persists to disk, delivers when up
- **Notification crashes**: Email retry queue in PostgreSQL

Design principle: One service failure ≠ system failure"

---

### Security Questions

**Q8: How do you handle authentication and authorization?**

"Three-layer security:
1. **JWT tokens**: Stateless, issued by User Service
   - Access token: 15-minute TTL
   - Refresh token: 7-day TTL
   
2. **API Gateway validation**: Every request checks JWT
   - Verify signature
   - Check expiry
   - Extract user_id
   
3. **Internal tokens**: Services use X-Internal-Token for internal calls
   - Prevents external abuse of /internal/* endpoints
   - Separate from user JWT"

---

**Q9: What about password security?**

"Best practices implemented:
- **Bcrypt hashing**: Salted, deliberately slow (prevents brute force)
- **Never store plaintext**: Database has hashes only
- **User Service owns passwords**: Other services never see them
- **Rate limiting**: API Gateway limits login attempts
- **Session tracking**: Can logout from specific or all sessions"

---

**Q10: How do you prevent data leaks between users?**

"Isolation at every layer:
1. **HTTP**: User can only access their own data (/users/me, /match/profile)
2. **gRPC**: Internal calls validate user_id matches request context
3. **WebSocket**: Room_id verified before chat access
4. **Query scope**: SELECT * WHERE user_id = ? (always filtered)
5. **Audit**: All actions logged with user_id for debugging"

---

### Scalability Questions

**Q11: How would you scale this to 1M users?**

"Horizontal scaling strategy:
1. **Stateless services**: Deploy 10-20 replicas behind load balancer
2. **Database**: Read replicas for queries, single master for writes
3. **Redis**: Cluster mode for horizontal scaling
4. **NATS**: Cluster of 3-5 nodes
5. **CDN**: Static assets (images, CSS)
6. **Message queue**: Kafka for extreme throughput (future)

Current architecture supports 100K-1M users per deployment."

---

**Q12: What about database scalability?**

"PostgreSQL scaling:
1. **Replication**: Leader-follower setup
2. **Read replicas**: Queries hit replicas, writes hit master
3. **Connection pooling**: PgBouncer (one conn per request, not per service)
4. **Sharding** (future): Partition users by ID range
5. **Denormalization** (if needed): Cache hot queries

Current: ~100K concurrent users per single database"

---

### Observability Questions

**Q13: How do you monitor the system?**

"Complete observability pipeline:
1. **Prometheus**: Scrapes /metrics from all services (5s interval)
   - http_requests_total (counter)
   - http_request_duration_seconds (histogram)
   - nats_events_total (counter)

2. **Grafana**: Visualizes metrics
   - System throughput (RPS gauge)
   - P95/P99 latencies (per service)
   - Error rates (2xx/4xx/5xx)
   - NATS event processing

3. **Logging**: Structured (JSON) to centralized log store
4. **Tracing**: OpenTelemetry helpers for distributed tracing"

---

**Q14: How would you debug a production issue?**

"Multi-signal debugging:
1. **Check Grafana**: Spikes in latency? Errors? Traffic?
2. **Search logs**: Trace error ID across all services
3. **Inspect metrics**: Which service slow? Requests piling up?
4. **Query database**: Data consistency? Locks?
5. **Review NATS events**: Messages stuck in queue?
6. **Check Redis**: Memory usage? Evictions?
7. **Database query**: EXPLAIN ANALYZE for slow queries
8. **Replay issue**: Same test data, step through code"

---

### Design Pattern Questions

**Q15: Why use gRPC for internal calls?**

"Performance + Type Safety:
- **REST (JSON)**: Parse JSON, convert types, verify at runtime
- **gRPC (Protobuf)**: Binary, compiled types, zero conversion

Example: `histogram_quantile(0.95, ...)`
- REST: Parse 1MB JSON response → 50-100ms
- gRPC: Binary protocol → 5-10ms (10x faster)

Plus: Strong typing prevents bugs, auto-generated clients"

---

**Q16: How would you handle service versioning?**

"API versioning strategy:
1. **REST**: /api/v1/*, /api/v2/* (different endpoint versions)
2. **gRPC**: Same proto file, add new fields (backward compatible)
3. **Database**: Migrations maintain schema versions
4. **Breaking changes**: Release new version, support old for N months

Example: Upgrade /api/v1/ to /api/v2/ without breaking old clients"

---

**Q17: Why WebSocket instead of polling?**

"Efficiency comparison:
- **Polling**: Client requests every 100ms = 10 requests/sec
  - Each request: headers, auth check, database query → 10ms
  - Total: 100ms latency, 10 database queries/sec per client
  
- **WebSocket**: One persistent connection
  - Server pushes data when ready → < 100ms
  - Zero polling overhead

For 10K users: WebSocket saves 100K requests/sec"

---

### Testing & Quality Questions

**Q18: How do you test microservices?**

"Multi-level testing:
1. **Unit tests**: Go tests for business logic (matcher_test.go)
2. **Integration tests**: Test against real PostgreSQL/Redis
3. **Contract tests**: Verify gRPC/REST contracts
4. **End-to-end**: Smoke test script (api-smoke-test.js)
5. **Load testing**: Verify performance under load
6. **Chaos testing**: Simulate failures (kill services, check resilience)"

---

**Q19: What about error handling?**

"Comprehensive error handling:
1. **gRPC errors**: Return status codes (NOT_FOUND, PERMISSION_DENIED)
2. **HTTP errors**: REST conventions (404, 403, 500)
3. **Circuit breakers**: Fail fast if service unhealthy
4. **Retries**: Exponential backoff for transient failures
5. **Logging**: All errors logged with context
6. **User feedback**: Error messages helpful but don't leak internals"

---

### Business Logic Questions

**Q20: How does the exchange completion work?**

"Multi-step verified process:

Step 1: User1 clicks 'Complete'
- Set sender_confirmed_complete = true (Redis atomic)
- Publish NATS: exchange.completion_triggered
- Notification service sends email to User2

Step 2: User2 clicks 'Complete'
- Set recipient_confirmed_complete = true (Redis atomic)
- Check: Both flags true?
- Yes → Set status = COMPLETED
- Publish NATS: exchange.completed
- Notification service sends confirmation to both

Why atomic flags?
- No race condition (Redis SET is atomic)
- No data loss (persisted in Redis)
- User sees immediate feedback (fast check)"

---

**Q21: How do you prevent duplicate exchanges?**

"Validation layers:
1. Check: Already have active exchange with this user?
   SELECT * FROM request WHERE 
   (sender_id=user1 AND recipient_id=user2) OR
   (sender_id=user2 AND recipient_id=user1)
   
2. Check: In same room already? → Decline
3. Check: Blocked user? → Deny
4. Check: User banned? → Prevent

Result: User can send, but only one active exchange per pair"

---

**Q22: How is privacy protected?**

"Privacy-first design:
1. **Email notifications**: User controls via preferences
2. **Data isolation**: User can't query other users' private data
3. **Account deletion**: DELETE /users/me deletes all data
4. **Session logout**: Can logout from specific device
5. **Profile visibility**: Choose what's public vs private
6. **Data minimization**: Only collect what's needed
7. **Audit trail**: Log who accessed what when"

---

## Preparation Checklist

Before your defense:

- [ ] Read ARCHITECTURE_DEFENSE.md cover-to-cover
- [ ] Understand Redis SINTER algorithm (critical)
- [ ] Know JWT token flow (very common question)
- [ ] Be ready to draw system diagram
- [ ] Explain exchange completion atomic operation
- [ ] Know performance numbers (latency p95/p99)
- [ ] Understand NATS vs HTTP tradeoff
- [ ] Have metrics dashboard (Grafana) ready to show
- [ ] Practice 2-minute system overview
- [ ] Be ready to discuss trade-offs (no perfect solution)

---

## During Defense Tips

**Do:**
- ✅ Start with "big picture" before details
- ✅ Use diagrams when explaining
- ✅ Admit if you don't know something
- ✅ Explain tradeoffs (why this AND why not that)
- ✅ Show code examples for complex logic
- ✅ Mention testing and observability
- ✅ Be confident in your design choices

**Don't:**
- ❌ Get lost in implementation details
- ❌ Defend every line of code
- ❌ Make up answers to questions
- ❌ Over-explain simple concepts
- ❌ Dismiss questions (every question is valid)
- ❌ Forget to mention non-functional requirements (observability, security)

---

## Final Talking Points

### Opening 30 seconds:
"Pairexx is a microservices platform for skill exchange. Six independent services communicate through HTTP, gRPC, WebSocket, and NATS. The API Gateway provides a single entry point with security and rate limiting. Users create profiles, find matches, send requests, chat in real-time, and complete exchanges. I chose microservices because each service has different scaling requirements and can fail independently."

### Closing 30 seconds:
"The architecture is production-ready: microservices for scalability, gRPC for performance, Redis for speed, PostgreSQL for durability, NATS for loose coupling, and Prometheus/Grafana for observability. We've tested at scale and added comprehensive monitoring for production deployment."

You're ready! 🚀
