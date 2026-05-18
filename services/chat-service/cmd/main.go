package main

import (
	"context"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nats-io/nats.go"
	"github.com/QosmuratSamat0/pairexx/chat-service/internal/client"
	"github.com/QosmuratSamat0/pairexx/chat-service/internal/config"
	delivery "github.com/QosmuratSamat0/pairexx/chat-service/internal/delivery/http"
	"github.com/QosmuratSamat0/pairexx/chat-service/internal/delivery/ws"
	"github.com/QosmuratSamat0/pairexx/chat-service/internal/domain"
	"github.com/QosmuratSamat0/pairexx/chat-service/internal/repository/postgres"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	goredis "github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

func main() {
	// Configure zerolog
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
	log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr})

	cfg := config.Load()
	validateConfig(cfg)

	rdb := goredis.NewClient(&goredis.Options{
		Addr: cfg.RedisURL,
	})
	defer rdb.Close()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// Initialize NATS connection if configured
	var nc *nats.Conn
	if cfg.NATSURL != "" {
		var err error
		nc, err = nats.Connect(cfg.NATSURL)
		if err != nil {
			log.Warn().Err(err).Msg("Failed to connect to NATS; running without distributed messaging")
			nc = nil
		} else {
			defer nc.Close()
			log.Info().Str("nats_url", cfg.NATSURL).Msg("Connected to NATS")
		}
	}

	hub := ws.NewHub(rdb, nc)
	go hub.Run(ctx)

	var repo domain.ChatRepository = postgres.NewInMemoryChatRepository()
	var pool *pgxpool.Pool
	if cfg.RepoDriver == "postgres" {
		var err error
		for i := 0; i < 10; i++ {
			pool, err = pgxpool.New(ctx, cfg.DBURL)
			if err == nil {
				err = pool.Ping(ctx)
				if err == nil {
					break
				}
			}
			log.Info().Int("attempt", i+1).Msg("Waiting for database...")
			time.Sleep(2 * time.Second)
		}
		if err != nil {
			log.Fatal().Err(err).Msg("failed to init postgres pool after retries")
		}
		defer pool.Close()

		if err := runMigrations(cfg.DBURL); err != nil {
			log.Warn().Err(err).Msg("Migration warning")
		}

		repo = postgres.NewPGChatRepository(pool)
	}

	modCli := client.NewModerationClient(cfg.ModerationServiceURL, cfg.InternalToken)

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	delivery.NewChatHandler(r, hub, repo, modCli, cfg.InternalToken, cfg.AppEnv, cfg.AllowedOrigins)

	// Prometheus metrics
	r.Handle("/metrics", promhttp.Handler())

	server := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: r,
	}

	go func() {
		log.Info().Str("port", cfg.Port).Msg("chat-service starting")
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal().Err(err).Msg("failed to start server")
		}
	}()

	<-ctx.Done()
	log.Info().Msg("shutting down chat-service...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Fatal().Err(err).Msg("server shutdown failed")
	}
	log.Info().Msg("chat-service stopped")
}

func validateConfig(cfg *config.Config) {
	if cfg.AppEnv != "development" {
		if cfg.InternalToken == "" || cfg.InternalToken == "dev-internal-token" {
			log.Fatal().Msg("INTERNAL_TOKEN must be set to a strong random value in non-development environments")
		}
		if cfg.RepoDriver == "postgres" && strings.Contains(cfg.DBURL, "user:pass@") {
			log.Fatal().Msg("DB_URL must be set (no default credentials) when REPO_DRIVER=postgres in non-development environments")
		}
	}
}

func runMigrations(dbURL string) error {
	// golang-migrate uses database/sql + lib/pq which doesn't understand pgxpool
	// query params (pool_*). Keep important params like sslmode, drop pool_*.
	migrateURL := dbURL
	if u, err := url.Parse(dbURL); err == nil && u.RawQuery != "" {
		q := u.Query()
		for key := range q {
			if strings.HasPrefix(key, "pool_") {
				q.Del(key)
			}
		}
		u.RawQuery = q.Encode()
		migrateURL = u.String()
	}

	m, err := migrate.New("file://migrations", migrateURL)
	if err != nil {
		return err
	}
	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		return err
	}
	return nil
}
