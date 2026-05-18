package middleware

import (
	"net"
	"net/http"
	"sync"
	"time"
)

// RateLimiter is a simple token bucket rate limiter stub
type RateLimiter struct {
	mu      sync.Mutex
	buckets map[string]int
}

func NewRateLimiter() *RateLimiter {
	return &RateLimiter{
		buckets: make(map[string]int),
	}
}

func (l *RateLimiter) Limit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Simple stub: allow all for now, or implement a basic count
		// In a real app, this would use Redis or a proper token bucket
		next.ServeHTTP(w, r)
	})
}

// InMemoryRateLimiter implements a very basic per-IP limiter
func InMemoryRateLimiter(rps int) func(http.Handler) http.Handler {
	type bucket struct {
		tokens float64
		last   time.Time
	}
	var mu sync.Mutex
	buckets := make(map[string]*bucket)

	// Cleanup stale buckets every minute
	go func() {
		ticker := time.NewTicker(1 * time.Minute)
		for range ticker.C {
			mu.Lock()
			for ip, b := range buckets {
				if time.Since(b.last) > 5*time.Minute {
					delete(buckets, ip)
				}
			}
			mu.Unlock()
		}
	}()

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := r.RemoteAddr
			if host, _, err := net.SplitHostPort(ip); err == nil {
				ip = host
			}

			mu.Lock()
			b, ok := buckets[ip]
			if !ok {
				b = &bucket{tokens: float64(rps), last: time.Now()}
				buckets[ip] = b
			}

			now := time.Now()
			b.tokens += now.Sub(b.last).Seconds() * float64(rps)
			if b.tokens > float64(rps) {
				b.tokens = float64(rps)
			}
			b.last = now

			if b.tokens < 1 {
				mu.Unlock()
				http.Error(w, "rate limit exceeded", http.StatusTooManyRequests)
				return
			}

			b.tokens--
			mu.Unlock()
			next.ServeHTTP(w, r)
		})
	}
}
