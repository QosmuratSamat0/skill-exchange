package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	_ "github.com/QosmuratSamat0/pairexx/api-gateway/docs"
	"github.com/QosmuratSamat0/pairexx/api-gateway/internal/client"
	"github.com/QosmuratSamat0/pairexx/api-gateway/internal/config"
	"github.com/QosmuratSamat0/pairexx/api-gateway/internal/handler"
	gwMiddleware "github.com/QosmuratSamat0/pairexx/api-gateway/internal/middleware"
	"github.com/QosmuratSamat0/pairexx/api-gateway/internal/proxy"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	httpSwagger "github.com/swaggo/http-swagger"
)

func main() {
	cfg := config.Load()
	validateConfig(cfg)

	// Setup logger
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
	if cfg.AppEnv == "development" {
		log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr})
	}

	r := chi.NewRouter()

	// Standard middleware
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(gwMiddleware.Tracing("api-gateway"))
	r.Use(gwMiddleware.Metrics)

	// Security Headers
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("X-Content-Type-Options", "nosniff")
			w.Header().Set("X-Frame-Options", "DENY")
			w.Header().Set("X-XSS-Protection", "1; mode=block")
			w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
			w.Header().Set("Content-Security-Policy", "default-src 'self'; frame-ancestors 'none';")
			next.ServeHTTP(w, r)
		})
	})

	// CORS
	origins := cfg.AllowedOrigins
	if cfg.AppEnv == "development" {
		origins = append(origins, cfg.DevAllowedOrigins...)
	}
	if len(origins) == 0 {
		if cfg.AppEnv == "development" {
			origins = []string{
				"http://localhost:3000",
				"http://127.0.0.1:3000",
				"http://localhost:5173",
				"http://127.0.0.1:5173",
			}
		} else {
			log.Fatal().Msg("ALLOWED_ORIGINS must be set (comma-separated) in non-development environments")
		}
	}

	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   origins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token", "X-Request-ID", "Last-Event-ID"},
		ExposedHeaders:   []string{"Link", "X-Request-ID"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Auth middleware (validation only)
	r.Use(gwMiddleware.Auth(cfg.JWTSecret))

	// Rate limiting (Redis): 600 req/min anon, 1000 req/min auth
	rl, err := gwMiddleware.NewRedisRateLimiter(cfg.RedisURL, 600, 1000)
	if err != nil {
		log.Warn().Err(err).Msg("failed to init redis rate limiter, falling back to in-memory")
		r.Use(gwMiddleware.InMemoryRateLimiter(100))
	} else {
		defer rl.Close()
		r.Use(rl.Middleware())
	}

	// Setup Proxy
	p := proxy.NewProxy()
	// User service is now handled by native gRPC handlers below
	p.AddTarget("/api/v1/match", cfg.MatchmakingServiceURL)
	p.AddTarget("/api/v1/users", cfg.UserServiceURL)
	p.AddTarget("/api/v1/report", cfg.ModerationServiceURL)
	p.AddTarget("/api/v1/chat", cfg.ChatServiceURL)
	p.AddTarget("/api/v1/notifications", cfg.NotificationServiceURL)
	p.AddTarget("/dashboard/chats/ws", cfg.ChatServiceURL)
	p.AddTarget("/ws", cfg.ChatServiceURL)

	// Health check (gateway level)
	r.Get("/api/v1/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	// gRPC Clients for BFF
	grpcClients, err := client.NewGRPCClients(cfg.UserServiceGRPCAddr, cfg.MatchmakingServiceGRPCAddr)
	if err != nil {
		log.Warn().Err(err).Msg("failed to init gRPC clients for BFF")
	}

	// BFF Routes
	bff := handler.NewBFFHandler(cfg, grpcClients)
	r.Get("/api/v1/bff/me", bff.GetMe)

	// Auth Routes (gRPC backed)
	auth := handler.NewAuthHandler(cfg, grpcClients)
	r.Post("/api/v1/users/anonymous", auth.CreateAnonymous)
	r.Post("/api/v1/users/login", auth.Login)
	r.Post("/api/v1/users/register", auth.Register)
	r.Post("/api/v1/users/refresh", auth.Refresh)

	// User Profile Routes (gRPC backed)
	user := handler.NewUserHandler(cfg, grpcClients)
	r.Get("/api/v1/users/me", user.GetMe)
	r.Put("/api/v1/users/me", user.UpdateMe)
	r.Get("/api/v1/users/{id}", user.GetByID)

	// Swagger & Docs
	r.Get("/api/v1/docs/swagger.yaml", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "./docs/swagger.yaml")
	})
	r.Get("/api/v1/docs/*", httpSwagger.Handler(
		httpSwagger.URL("/api/v1/docs/swagger.yaml"),
	))

	// Proxy all requests starting with /api/v1
	r.Group(func(r chi.Router) {
		r.Use(gwMiddleware.DenyInternal)
		r.HandleFunc("/api/v1/*", p.Handler)
	})

	// WebSocket handler
	r.HandleFunc("/dashboard/chats/ws", p.Handler)
	r.HandleFunc("/ws", p.Handler)
	r.HandleFunc("/ws/*", p.Handler)

	// Prometheus metrics
	r.Handle("/metrics", promhttp.Handler())

	// Fallback for any other requests
	r.NotFound(p.Handler)

	server := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           r,
		ReadHeaderTimeout: 10 * time.Second, // Protect against Slowloris
		ReadTimeout:       0,                // Allow long-lived connections (WS/SSE)
		WriteTimeout:      0,                // Allow long-lived connections (WS/SSE)
		IdleTimeout:       1 * time.Hour,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		log.Info().
			Str("port", cfg.Port).
			Str("env", cfg.AppEnv).
			Msg("api-gateway starting...")
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal().Err(err).Msg("failed to start server")
		}
	}()

	<-ctx.Done()
	stop()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Fatal().Err(err).Msg("server shutdown failed")
	}
	log.Info().Msg("api-gateway stopped")
}

func validateConfig(cfg *config.Config) {
	if cfg.AppEnv != "development" {
		if cfg.JWTSecret == "" || cfg.JWTSecret == "very-secret-key" {
			log.Fatal().Msg("JWT_SECRET must be set to a strong random value in non-development environments")
		}
	}
}
