# Quick Commands Reference - Copy & Paste

## PostgreSQL Commands

### Access Database
```bash
# Via Docker
docker exec -it $(docker ps | grep postgres | awk '{print $1}') psql -U postgres

# Via local install
psql -U postgres -h localhost

# Connect to specific database
\c users_db
\c chat_db
\c moderation_db
\c notification_db
```

### View Data
```sql
-- All users
SELECT id, email, is_banned, created_at FROM users;

-- Specific user
SELECT * FROM users WHERE email = 'user@example.com';

-- User profile
SELECT * FROM user_profiles WHERE user_id = 'your-uuid-here';

-- User reviews
SELECT * FROM reviews WHERE to_user_id = 'user-uuid';

-- Active sessions
SELECT user_id, ip, created_at, expires_at FROM user_sessions 
WHERE expires_at > NOW();

-- Count stats
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM user_profiles;
SELECT COUNT(*) FROM reviews;
SELECT COUNT(*) FROM user_sessions;

-- All tables in current database
\dt

-- Table structure
\d users
\d user_profiles
\d user_sessions
\d reviews
```

### Modify Data (Be Careful!)
```sql
-- Ban a user
UPDATE users SET is_banned = true WHERE email = 'user@example.com';

-- Unban a user
UPDATE users SET is_banned = false WHERE email = 'user@example.com';

-- Delete user (cascades everything)
DELETE FROM users WHERE email = 'user@example.com';

-- Clear all users (⚠️ WARNING)
DELETE FROM users;

-- Reset migrations (⚠️ WARNING - deletes schema)
DROP TABLE IF EXISTS schema_migrations;
```

### Useful Queries
```sql
-- Find users who have not set up profile
SELECT u.id, u.email FROM users u
LEFT JOIN user_profiles up ON u.id = up.user_id
WHERE up.user_id IS NULL;

-- Users with most reviews
SELECT to_user_id, COUNT(*) as review_count, AVG(rating) as avg_rating
FROM reviews
GROUP BY to_user_id
ORDER BY review_count DESC;

-- Active users (have sessions)
SELECT DISTINCT user_id FROM user_sessions
WHERE expires_at > NOW();

-- List all databases
\l

-- Show all connections
SELECT datname, usename, application_name, state FROM pg_stat_activity;

-- Exit
\q
```

---

## Redis Commands

### Access Redis
```bash
# Via Docker
docker exec -it $(docker ps | grep redis | awk '{print $1}') redis-cli

# Via local install
redis-cli -h localhost -p 6379

# Via RedisInsight GUI
# Download: https://redis.com/redis-enterprise/redisinsight/
```

### View Keys
```bash
# List all keys
KEYS *

# List keys matching pattern
KEYS "profile:*"           # All profiles
KEYS "request:*"           # All requests
KEYS "skill:*"             # All skill indexes
KEYS "user:status:*"       # All online status
KEYS "user:room:*"         # All user rooms
KEYS "room:*"              # All rooms

# Count keys
DBSIZE

# Get key type
TYPE profile:user123
```

### View Data
```bash
# Get string value
GET profile:user123

# Get hash (structured data)
HGETALL profile:user123
HGETALL user:stats:user123

# Get set members
SMEMBERS skill:teach:Go
SMEMBERS skill:learn:React
SMEMBERS room:participants:room123

# Get list items
LRANGE messages:room123 0 -1       # All messages
LRANGE messages:room123 -10 -1     # Last 10 messages
LRANGE user:rooms:user123 0 -1     # All rooms for user

# Check if exists
EXISTS profile:user123

# Get expiration (TTL)
TTL profile:user123
PTTL profile:user123  # Milliseconds

# Get all info about a key
DUMP profile:user123
```

### Matching Algorithm Demo
```bash
# Who teaches Go?
SMEMBERS skill:teach:Go

# Who wants to learn Go?
SMEMBERS skill:learn:Go

# Find matches (teaches what I want, wants what I teach)
SINTER skill:teach:Go skill:learn:Go

# Count matches
SCARD $(SINTER skill:teach:Go skill:learn:Go)
```

### Modify Data
```bash
# Set string
SET profile:user123 "{ json data }"
SET user:status:user123 $(date +%s)

# Set with expiration
SET user:status:user123 "2025-05-18" EX 300

# Add to set
SADD skill:teach:Go user123
SADD skill:learn:React user456

# Remove from set
SREM skill:teach:Go user123

# Add to list
LPUSH messages:room123 "message data"
RPUSH messages:room123 "message data"

# Delete key
DEL profile:user123
DEL $(KEYS 'profile:*')  # Delete pattern

# Clear all (⚠️ WARNING)
FLUSHALL

# Clear current database
FLUSHDB
```

---

## API Endpoints - Data Operations

### Create User
```bash
curl -X POST http://localhost:8080/api/v1/users/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123456!"
  }'
```

### Login
```bash
curl -X POST http://localhost:8080/api/v1/users/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123456!"
  }'
# Result: {access_token, refresh_token}
```

### Get User Profile
```bash
TOKEN="your-jwt-token-here"
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/v1/users/me
```

### Update Profile
```bash
curl -X PUT http://localhost:8080/api/v1/users/me/profile \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "bio": "Go developer",
    "teach_skills": ["Go", "Docker"],
    "learn_skills": ["React", "Node.js"]
  }'
```

### Create Exchange Request
```bash
curl -X POST http://localhost:8080/api/v1/match/request \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "recipient_id": "user-uuid-here"
  }'
```

### Get Metrics
```bash
curl http://localhost:8080/metrics
# Shows all Prometheus metrics
```

---

## Docker Commands - Container Management

### View Containers
```bash
# List running containers
docker ps

# List all containers
docker ps -a

# Show container size
docker ps --size
```

### Access Services
```bash
# PostgreSQL
docker exec -it <postgres-id> psql -U postgres

# Redis
docker exec -it <redis-id> redis-cli

# NATS
docker exec -it <nats-id> /bin/sh

# View logs
docker logs <container-id>
docker logs -f <container-id>  # Follow logs
```

### Database Operations
```bash
# Backup database
docker exec <postgres-id> pg_dump -U postgres users_db > backup.sql

# Restore database
docker exec -i <postgres-id> psql -U postgres users_db < backup.sql

# Connect and run SQL
docker exec -it <postgres-id> psql -U postgres -c "SELECT * FROM users;"
```

---

## Useful One-Liners

### Count everything
```bash
# PostgreSQL
psql -U postgres -d users_db -c "SELECT COUNT(*) FROM users;"

# Redis
redis-cli DBSIZE
```

### Check if service is running
```bash
# HTTP endpoint
curl -s http://localhost:8080/api/v1/health | grep OK

# Check all services
curl -s http://localhost:8080/api/v1/health && \
curl -s http://localhost:8081/api/v1/health && \
curl -s http://localhost:8082/api/v1/health
```

### Generate test data
```bash
# Create 10 test users
for i in {1..10}; do
  curl -s -X POST http://localhost:8080/api/v1/users/register \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"user$i@test.com\",\"password\":\"Test123!\"}" \
    > /dev/null
  echo "Created user$i"
done
```

### Monitor metrics
```bash
# Watch metrics update (every 2 seconds)
watch -n 2 'curl -s http://localhost:8080/metrics | grep http_requests_total'

# Or with Prometheus
curl 'http://localhost:9090/api/v1/query?query=http_requests_total'
```

### Load test
```bash
# 100 requests
for i in {1..100}; do
  curl -s http://localhost:8080/api/v1/health > /dev/null &
done
wait

# View metrics after
curl -s http://localhost:8080/metrics | grep http_requests_total
```

---

## Troubleshooting Commands

### Check service health
```bash
# API Gateway
curl http://localhost:8080/api/v1/health

# User Service
curl http://localhost:8081/api/v1/health

# Matchmaking
curl http://localhost:8082/api/v1/health

# Chat
curl http://localhost:8083/api/v1/health
```

### Check connections
```bash
# PostgreSQL connections
psql -U postgres -c "SELECT datname, count(*) FROM pg_stat_activity GROUP BY datname;"

# Redis memory
redis-cli INFO memory

# NATS info
docker exec nats nats-server -stats
```

### Find issues
```bash
# PostgreSQL errors
psql -U postgres -d users_db -c "SELECT * FROM pg_stat_statements ORDER BY calls DESC LIMIT 10;"

# Redis key usage
redis-cli --bigkeys

# Docker errors
docker logs api-gateway
docker logs user-service
docker logs matchmaking-service
```

---

## Common Debug Scenarios

### "User can't login"
```sql
-- Check in PostgreSQL
SELECT id, email, is_banned FROM users WHERE email = 'user@example.com';
-- If is_banned = true, that's the problem
```

### "Matching not working"
```bash
# Check Redis
redis-cli
SMEMBERS skill:teach:Go
SMEMBERS skill:learn:React
# If empty, profiles not being indexed
```

### "Exchange stuck"
```bash
# Check request state
redis-cli GET request:req123
# Check if sender_confirmed and recipient_confirmed both true
```

### "No metrics showing"
```bash
# Check if services are running
curl http://localhost:8080/metrics

# Check Prometheus is scraping
curl http://localhost:9090/api/v1/targets

# Check recent requests (generate load)
for i in {1..50}; do curl -s http://localhost:8080/api/v1/health & done
```

---

## Environment Check

```bash
# Show environment variables
env | grep PAIREXX
env | grep DB_
env | grep REDIS_

# Show .env file (don't commit!)
cat .env

# Verify services can reach each other
# From api-gateway container
curl http://user-service:8081/api/v1/health
curl http://matchmaking-service:8082/api/v1/health

# Check Docker network
docker network ls
docker network inspect bridge
```

Save this file and refer to it whenever you need to debug! 📋
