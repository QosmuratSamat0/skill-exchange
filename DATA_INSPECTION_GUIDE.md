# Database Transactions, Migrations & Data Inspection Guide

## ✅ What You Have

### Database Migrations (Schema Management)

Your project has **4 services with migrations** (schema version control):

```
User Service:           4 migration files (most complex)
Chat Service:           1 migration file
Moderation Service:     2 migration files
Notification Service:   1 migration file
────────────────────────────────────────
TOTAL:                  8 migration files
```

### Migration Files Structure

```
services/{service}/migrations/
├─ NNNN_description.up.sql     (Forward: What to apply)
└─ NNNN_description.down.sql   (Backward: How to undo)
```

**Example:** User Service migrations
```
0001_init.up.sql           - Create initial schema
0002_skill_exchange.up.sql - Add profiles, reviews, sessions
0003_contact_number.up.sql - Add contact_number column
0004_email_notifications.up.sql - Add email_notifications column
```

---

## 🗄️ User Service Migrations (Most Complex)

### Migration 0001: Initial Schema
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255),
    email_verified BOOLEAN,
    is_banned BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
```

### Migration 0002: Skill Exchange
```sql
CREATE TABLE user_profiles (
    user_id UUID PRIMARY KEY,
    teach_skills TEXT[],       -- ["Go", "Python"]
    learn_skills TEXT[],       -- ["React", "Node.js"]
    rating DOUBLE PRECISION,
    review_count INT
);

CREATE TABLE reviews (
    id UUID PRIMARY KEY,
    from_user_id UUID,
    to_user_id UUID,
    rating INT CHECK(1-5),
    UNIQUE(from_user_id, to_user_id)  -- One review per pair
);

CREATE TABLE user_sessions (
    id UUID PRIMARY KEY,
    user_id UUID,
    refresh_token VARCHAR(500) UNIQUE,
    ip VARCHAR(45),
    expires_at TIMESTAMPTZ
);
```

### Migration 0003: Contact Number
```sql
ALTER TABLE users ADD COLUMN contact_number VARCHAR(20);
```

### Migration 0004: Email Notifications
```sql
ALTER TABLE users ADD COLUMN email_notifications BOOLEAN DEFAULT true;
```

---

## 🔄 How Migrations Work

### When you run: `go run .`

```
1. Load .env configuration
2. Connect to PostgreSQL
3. For each service:
   ├─ Check migrations table
   ├─ Compare against applied migrations
   ├─ Find new migrations (.up.sql)
   ├─ Execute in order
   └─ Record completion
```

### Example Output
```
Loading migrations from ./migrations...
Running migration: 0001_init.up.sql
Running migration: 0002_skill_exchange.up.sql
Running migration: 0003_contact_number.up.sql
Running migration: 0004_email_notifications.up.sql
All migrations completed successfully
```

---

## ⚙️ Transactions in Your Code

### PostgreSQL Transactions (ACID Compliance)

Your services use **implicit transactions** for safety:

```go
// User Service: CreateUser
_, err := r.pool.Exec(ctx, `
    INSERT INTO users (id, email, password_hash, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5)
`)

// Each Exec() is wrapped in a transaction automatically:
// BEGIN
// INSERT ...
// COMMIT (if success) or ROLLBACK (if error)
```

### Complex Transaction Example

**User Session Management:**
```sql
-- UPDATE: Change password (transaction)
BEGIN;
  UPDATE users SET password_hash = $1 WHERE id = $2;
  DELETE FROM user_sessions WHERE user_id = $2;  -- Logout all
  SELECT 1;  -- Verify both succeeded
COMMIT;

-- If either fails → ROLLBACK (restore to before BEGIN)
```

### Redis Atomic Operations (No Transactions Needed)

Redis in Matchmaking uses **atomic operations**:

```go
// Redis SINTER is atomic (one operation)
result, err := r.rdb.SInter(ctx, 
    "skill:teach:Go",      // Who teaches Go
    "skill:learn:Go"       // Who wants to learn Go
).Val()

// Even if multiple clients do this simultaneously:
// ✅ Result is consistent (atomic)
// ❌ No race conditions
// ❌ No locks needed
```

### Redis Pub/Sub (Fan-out Notifications)

```go
// Matchmaking publishes
r.rdb.Publish(ctx, "match:notifications", payload)

// Notification service listens
pubsub := r.rdb.Subscribe(ctx, "match:notifications")
ch := pubsub.Channel()
for msg := range ch {
    // Process each message
}
```

---

## 🔍 How to Inspect Data

### 1. PostgreSQL - View Data with psql

#### Connect to PostgreSQL
```bash
# Option A: Docker container
docker exec -it <postgres_container_id> psql -U postgres

# Option B: Local install
psql -U postgres -h localhost -d users_db

# Common databases:
# - users_db
# - chat_db
# - moderation_db
# - notification_db
```

#### Basic Queries

```sql
-- List all databases
\l

-- Connect to database
\c users_db

-- List tables
\dt

-- View users
SELECT id, email, is_banned, created_at FROM users;

-- View user profiles
SELECT * FROM user_profiles;

-- View reviews
SELECT * FROM reviews ORDER BY created_at DESC;

-- View sessions (active login sessions)
SELECT user_id, ip, created_at, expires_at FROM user_sessions;

-- Check if user is banned
SELECT is_banned FROM users WHERE email = 'user@example.com';

-- View a single user's complete profile
SELECT u.*, up.* FROM users u
LEFT JOIN user_profiles up ON u.id = up.user_id
WHERE u.email = 'user@example.com';
```

#### Advanced Queries

```sql
-- Count users
SELECT COUNT(*) FROM users;

-- Users with active sessions
SELECT DISTINCT user_id FROM user_sessions 
WHERE expires_at > NOW();

-- Most reviewed users
SELECT to_user_id, COUNT(*) as review_count
FROM reviews
GROUP BY to_user_id
ORDER BY review_count DESC
LIMIT 10;

-- Users with skills
SELECT email, teach_skills, learn_skills
FROM users u
JOIN user_profiles up ON u.id = up.user_id
WHERE u.is_banned = false;

-- Active exchanges (would be in Redis, not DB)
-- See Redis section below
```

#### Modify Data (Be Careful!)

```sql
-- Ban a user
UPDATE users SET is_banned = true WHERE email = 'user@example.com';

-- Restore password
UPDATE users SET password_hash = 'new_hash' WHERE id = 'user_id';

-- Delete a user (cascading delete)
DELETE FROM users WHERE email = 'user@example.com';
-- Automatically deletes: profiles, sessions, reviews, etc.
```

---

### 2. Redis - View Cache & State

#### Connect to Redis
```bash
# Option A: Docker container
docker exec -it <redis_container_id> redis-cli

# Option B: Local install
redis-cli -h localhost -p 6379

# Option C: GUI (RedisInsight)
# Download from: https://redis.com/redis-enterprise/redisinsight/
```

#### Basic Commands

```bash
# List all keys
KEYS *

# Get key pattern
KEYS "profile:*"        # All user profiles
KEYS "skill:teach:*"    # All teaching skills
KEYS "request:*"        # All exchange requests
KEYS "user:room:*"      # User's current room
KEYS "user:status:*"    # User online status

# View key type
TYPE profile:user123

# Get string value
GET profile:user123

# Get hash (structured data)
HGETALL user:stats:user123

# Get set members
SMEMBERS skill:teach:Go  # Who teaches Go?

# List all items
LRANGE messages:room123 0 -1

# Check key expiration
TTL profile:user123  # -1 = no expiration, -2 = doesn't exist
```

#### Complex Queries

```bash
# Find matching candidates (SINTER algorithm)
SINTER skill:teach:Go skill:learn:React

# Who teaches Go?
SMEMBERS skill:teach:Go

# Who wants to learn React?
SMEMBERS skill:learn:React

# Intersection (both teach Go AND want to learn React)
SINTER skill:teach:Go skill:learn:React

# Get user profile
HGETALL profile:user123

# Get user stats
HGETALL user:stats:user123

# Check user online status
GET user:status:user123  # Should return timestamp

# List all rooms user is in
LRANGE user:rooms:user123 0 -1

# Get room participants
SMEMBERS room:participants:room123

# View active requests
KEYS request:*
GET request:req123
```

#### Modify Redis Data

```bash
# Set user profile
HSET profile:user123 \
  teach_skills "Go,Python,Docker" \
  learn_skills "React,Node.js" \
  online true

# Add skill index
SADD skill:teach:Go user123 user456

# Set online status
SET user:status:user123 $(date +%s) EX 300

# Clear all cache (careful!)
FLUSHALL

# Delete specific key
DEL profile:user123

# Clear pattern
DEL $(KEYS 'profile:*')  # Won't work, need loop
```

---

## 📊 Complete Data Inspection Workflow

### Scenario: "Check if user can complete an exchange"

```bash
# Terminal 1: Connect to PostgreSQL
psql -U postgres -d users_db

# Query user data
SELECT id, email, is_banned FROM users WHERE email = 'user1@example.com';
# Result: id = 'abc123', is_banned = false ✅

# Terminal 2: Connect to Redis
redis-cli

# Check Redis exchange request state
GET request:req456
# Result: {"id": "req456", "status": "ACCEPTED", "sender_confirmed": false, "recipient_confirmed": false}

# Check both users are online
GET user:status:abc123  # Sender
GET user:status:def789  # Recipient
# Result: Both have timestamps < 5 min old ✅

# Check NATS event queue (in Notification Service logs)
# docker logs notification-service | grep "exchange.completed"
```

---

## 🛠️ Tools for Data Inspection

### PostgreSQL Tools

#### 1. psql (CLI - Built-in)
```bash
psql -U postgres -h localhost
```

#### 2. pgAdmin (GUI)
```bash
# Docker
docker run -p 5050:80 \
  -e PGADMIN_DEFAULT_EMAIL=admin@admin.com \
  -e PGADMIN_DEFAULT_PASSWORD=admin \
  dpage/pgadmin4

# Open: http://localhost:5050
```

#### 3. DBeaver (Desktop GUI)
```bash
# Free download: https://dbeaver.io/download/
# Universal database tool
# Supports PostgreSQL, MySQL, MongoDB, etc.
```

### Redis Tools

#### 1. redis-cli (CLI - Built-in)
```bash
redis-cli -h localhost -p 6379
```

#### 2. RedisInsight (GUI - Official)
```bash
# Download: https://redis.com/redis-enterprise/redisinsight/
# Modern GUI for Redis
# View keys, execute commands, monitor performance
```

#### 3. Redis Commander (Web)
```bash
npm install -g redis-commander
redis-commander --port 8081
# Open: http://localhost:8081
```

---

## 🎬 Live Demo: Inspecting Data

### Demo 1: Create User and Check Data

```bash
# Step 1: Create user via API
curl -X POST http://localhost:8080/api/v1/users/register \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@example.com","password":"Test123!"}'

# Result: {access_token, refresh_token}

# Step 2: Check in PostgreSQL
psql -U postgres -d users_db
SELECT * FROM users WHERE email = 'demo@example.com';

# Step 3: Check session in Redis
redis-cli
KEYS "user:session:*"
GET user:session:demo@example.com
```

### Demo 2: Create Exchange and Check Redis State

```bash
# Step 1: User1 sends exchange request
curl -X POST http://localhost:8080/api/v1/match/request \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"recipient_id":"user2_id"}'

# Result: {"request_id": "req123"}

# Step 2: Check in Redis
redis-cli
GET request:req123
# Result: {status: PENDING, sender_confirmed: false, ...}

# Step 3: User2 accepts
curl -X POST http://localhost:8080/api/v1/match/request/req123/accept \
  -H "Authorization: Bearer <JWT>"

# Step 4: Check Redis again
GET request:req123
# Result: {status: ACCEPTED, ...}
```

### Demo 3: Monitor Metrics

```bash
# View live metrics
curl http://localhost:8080/metrics | grep http_requests_total

# Result:
# http_requests_total{method="POST",route="/api/v1/match/request",status="200"} 5
# http_requests_total{method="POST",route="/api/v1/match/request",status="400"} 1
```

---

## 📋 Data Structure Reference

### PostgreSQL Tables

```
users
├─ id (UUID)
├─ email (VARCHAR)
├─ password_hash (VARCHAR)
├─ is_banned (BOOLEAN)
├─ email_notifications (BOOLEAN)
├─ created_at (TIMESTAMPTZ)
└─ updated_at (TIMESTAMPTZ)

user_profiles
├─ user_id (UUID) → users(id)
├─ teach_skills (TEXT[]) = ["Go", "Python"]
├─ learn_skills (TEXT[]) = ["React", "Node.js"]
├─ rating (DOUBLE PRECISION)
└─ review_count (INT)

user_sessions
├─ id (UUID)
├─ user_id (UUID) → users(id)
├─ refresh_token (VARCHAR)
├─ ip (VARCHAR)
└─ expires_at (TIMESTAMPTZ)

reviews
├─ id (UUID)
├─ from_user_id (UUID) → users(id)
├─ to_user_id (UUID) → users(id)
├─ rating (INT) 1-5
└─ created_at (TIMESTAMPTZ)
```

### Redis Data Structures

```
Strings (Simple values):
├─ profile:user123 → {JSON object}
├─ user:status:user123 → timestamp
└─ request:req123 → {JSON object}

Sets (Collections with no duplicates):
├─ skill:teach:Go → {user1, user2, user3}
├─ skill:learn:React → {user1, user5}
└─ room:participants:room123 → {user1, user2}

Lists (Ordered collections):
├─ messages:room123 → [msg1, msg2, msg3, ...]
└─ user:rooms:user123 → [room1, room2, ...]

Hashes (Structured data):
├─ user:stats:user123 → {matches: 5, completed: 3, ...}
└─ profile:user123 → {teach_skills: ..., learn_skills: ...}
```

---

## ✅ Transactions & Consistency

### How Your System Maintains Consistency

**1. PostgreSQL (ACID)**
```
Atomicity:   All or nothing (not half-executed)
Consistency: Valid state before and after
Isolation:   Concurrent ops don't interfere
Durability:  Data survives crashes
```

**2. Redis (Atomic Operations)**
```
Each operation is atomic:
- SINTER (set intersection)
- SADD (add to set)
- SET/GET (string operations)
- All complete "as one" with no race conditions
```

**3. NATS (Durable Events)**
```
Exchange.triggered event:
- Published by Matchmaking
- Persisted in NATS JetStream
- Notification service consumes when ready
- Auto-retry if processing fails
```

---

## 🔧 Quick Commands Reference

### Start Services & Inspect

```bash
# 1. Start backend
go run .

# 2. Connect to PostgreSQL
psql -U postgres -d users_db

# 3. Connect to Redis
redis-cli -h localhost -p 6379

# 4. View Prometheus metrics
curl http://localhost:8080/metrics

# 5. View Grafana dashboard
open http://localhost:3001
```

### Useful Queries (Copy-Paste)

```sql
-- PostgreSQL: Count everything
SELECT 'users' as table_name, COUNT(*) FROM users
UNION ALL
SELECT 'user_profiles', COUNT(*) FROM user_profiles
UNION ALL
SELECT 'reviews', COUNT(*) FROM reviews
UNION ALL
SELECT 'user_sessions', COUNT(*) FROM user_sessions;

-- Redis: View all keys and their sizes
KEYS * | xargs -I {} sh -c 'echo "Key: {}"; STRLEN {} || HLEN {} || SCARD {} || LLEN {}'
```

You're all set to inspect and debug your data! 🎉
