package middleware

import (
	"context"
	"errors"
	"net"
	"net/http"
	"strings"
	"time"

	goredis "github.com/redis/go-redis/v9"
)

type RedisRateLimiter struct {
	rdb       *goredis.Client
	anonLimit int
	authLimit int
}

func NewRedisRateLimiter(redisURL string, anonLimitPerMin int, authLimitPerMin int) (*RedisRateLimiter, error) {
	opts, err := parseRedisOptions(redisURL)
	if err != nil {
		return nil, err
	}
	return &RedisRateLimiter{
		rdb:       goredis.NewClient(opts),
		anonLimit: anonLimitPerMin,
		authLimit: authLimitPerMin,
	}, nil
}

func (l *RedisRateLimiter) Close() error { return l.rdb.Close() }

func (l *RedisRateLimiter) Middleware() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			scope, id, limit := l.getScopeIDLimit(r)
			if id == "" || limit <= 0 {
				next.ServeHTTP(w, r)
				return
			}

			now := time.Now().UTC()
			window := now.Format("200601021504") // minute bucket
			key := "rl:" + scope + ":" + id + ":" + window

			ctx, cancel := context.WithTimeout(r.Context(), 150*time.Millisecond)
			defer cancel()

			pipe := l.rdb.Pipeline()
			incr := pipe.Incr(ctx, key)
			pipe.Expire(ctx, key, 2*time.Minute)
			_, err := pipe.Exec(ctx)
			if err != nil {
				// Fail-open to avoid taking down API due to redis blip.
				next.ServeHTTP(w, r)
				return
			}

			n, err := incr.Result()
			if err != nil {
				next.ServeHTTP(w, r)
				return
			}
			if int(n) > limit {
				w.Header().Set("Retry-After", "60")
				http.Error(w, "rate limit exceeded", http.StatusTooManyRequests)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

func (l *RedisRateLimiter) getScopeIDLimit(r *http.Request) (scope string, id string, limit int) {
	// Auth middleware sets X-User-ID if token is present/valid.
	if userID := r.Header.Get("X-User-ID"); userID != "" {
		return "user", userID, l.authLimit
	}

	ip := clientIP(r)
	if ip == "" {
		return "", "", 0
	}
	return "ip", ip, l.anonLimit
}

func clientIP(r *http.Request) string {
	// middleware.RealIP should already set RemoteAddr properly, but keep a fallback.
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil && host != "" {
		return host
	}
	return r.RemoteAddr
}

func parseRedisOptions(redisURL string) (*goredis.Options, error) {
	if strings.HasPrefix(redisURL, "redis://") || strings.HasPrefix(redisURL, "rediss://") {
		return goredis.ParseURL(redisURL)
	}
	if redisURL == "" {
		return nil, errors.New("REDIS_URL is empty")
	}
	if strings.Contains(redisURL, ":") {
		// already host:port
		return &goredis.Options{Addr: redisURL}, nil
	}
	return &goredis.Options{Addr: redisURL}, nil
}
