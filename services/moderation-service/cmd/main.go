package main

import (
	"context"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/QosmuratSamat0/pairexx/moderation-service/internal/client"
	"github.com/QosmuratSamat0/pairexx/moderation-service/internal/config"
	delivery "github.com/QosmuratSamat0/pairexx/moderation-service/internal/delivery/http"
	"github.com/QosmuratSamat0/pairexx/moderation-service/internal/domain"
	"github.com/QosmuratSamat0/pairexx/moderation-service/internal/repository/memory"
	"github.com/QosmuratSamat0/pairexx/moderation-service/internal/repository/postgres"
	"github.com/QosmuratSamat0/pairexx/moderation-service/internal/usecase"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

func main() {
	cfg := config.Load()
	validateConfig(cfg)

	var repo domain.ReportRepository = memory.New()
	var pool *pgxpool.Pool
	if cfg.RepoDriver == "postgres" {
		var err error
		for i := 0; i < 10; i++ {
			pool, err = pgxpool.New(context.Background(), cfg.DBURL)
			if err == nil {
				err = pool.Ping(context.Background())
				if err == nil {
					break
				}
			}
			log.Printf("Waiting for database... (%d/10)", i+1)
			time.Sleep(2 * time.Second)
		}
		if err != nil {
			log.Fatalf("failed to init postgres pool after retries: %v", err)
		}
		defer pool.Close()

		if err := runMigrations(cfg.DBURL); err != nil {
			log.Printf("Migration warning: %v", err)
		}

		repo = postgres.NewPGReportRepository(pool)
	}

	userCli := client.NewUserClient(cfg.UserServiceURL, cfg.InternalToken)
	chatCli := client.NewChatClient(cfg.ChatServiceURL, cfg.InternalToken)
	notifCli := client.NewNotificationClient(cfg.NotificationServiceURL, cfg.InternalToken)
	uc := usecase.New(repo, userCli, chatCli, notifCli, cfg.ToxicWords)

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	delivery.New(r, uc, cfg.InternalToken)

	// Prometheus metrics
	r.Handle("/metrics", promhttp.Handler())

	log.Printf("moderation-service starting on port %s", cfg.Port)
	if err := http.ListenAndServe(":"+cfg.Port, r); err != nil {
		log.Fatalf("failed to start server: %v", err)
	}
}

func validateConfig(cfg *config.Config) {
	if cfg.AppEnv != "development" {
		if cfg.InternalToken == "" || cfg.InternalToken == "dev-internal-token" {
			log.Fatalf("INTERNAL_TOKEN must be set to a strong random value in non-development environments")
		}
		if cfg.RepoDriver == "postgres" && strings.Contains(cfg.DBURL, "user:pass@") {
			log.Fatalf("DB_URL must be set (no default credentials) when REPO_DRIVER=postgres in non-development environments")
		}
	}
}

func runMigrations(dbURL string) error {
	baseAddr := dbURL
	if u, err := url.Parse(dbURL); err == nil && u.Scheme != "" {
		sslmode := u.Query().Get("sslmode")
		u.RawQuery = ""
		if sslmode != "" {
			q := url.Values{}
			q.Set("sslmode", sslmode)
			u.RawQuery = q.Encode()
		}
		baseAddr = u.String()
	} else if idx := strings.Index(baseAddr, "?"); idx != -1 {
		noQuery := baseAddr[:idx]
		ssl := ""
		for _, part := range strings.Split(baseAddr[idx+1:], "&") {
			if strings.HasPrefix(part, "sslmode=") {
				ssl = part
				break
			}
		}
		if ssl != "" {
			baseAddr = noQuery + "?" + ssl
		} else {
			baseAddr = noQuery
		}
	}

	m, err := migrate.New("file://migrations", baseAddr)
	if err != nil {
		return err
	}
	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		return err
	}
	return nil
}
