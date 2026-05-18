package main

import (
	"context"
	"crypto/tls"
	"fmt"
	"log"
	"net"
	"net/http"
	gosmtp "net/smtp"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/rs/zerolog"
	zlog "github.com/rs/zerolog/log"

	smtpChannel "github.com/QosmuratSamat0/pairexx/notification-service/internal/channel/smtp"
	"github.com/QosmuratSamat0/pairexx/notification-service/internal/config"
	delivery "github.com/QosmuratSamat0/pairexx/notification-service/internal/delivery/http"
	"github.com/QosmuratSamat0/pairexx/notification-service/internal/domain"
	"github.com/QosmuratSamat0/pairexx/notification-service/internal/repository/postgres"
	"github.com/QosmuratSamat0/pairexx/notification-service/internal/usecase"
	"github.com/QosmuratSamat0/pairexx/pkg/mq"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

func main() {
	cfg := config.Load()

	// ── Zerolog: human-readable console output in development ─────────────────
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
	if cfg.AppEnv == "development" {
		zlog.Logger = zlog.Output(zerolog.ConsoleWriter{Out: os.Stderr})
	}

	// ── Startup config audit ──────────────────────────────────────────────────
	log.Printf("=== notification-service startup config ===")
	log.Printf("  APP_ENV            = %s", cfg.AppEnv)
	log.Printf("  PORT               = %s", cfg.Port)
	log.Printf("  SMTP_HOST          = %s", cfg.SMTPHost)
	log.Printf("  SMTP_PORT          = %s", cfg.SMTPPort)
	log.Printf("  SMTP_SENDER        = %q", cfg.SMTPSender)
	log.Printf("  SMTP_PASSWORD_LEN  = %d  (empty=%v)", len(cfg.SMTPPassword), cfg.SMTPPassword == "")
	log.Printf("  USER_SERVICE_URL   = %s", cfg.UserServiceURL)
	log.Printf("  INTERNAL_TOKEN_SET = %v  (len=%d)", cfg.InternalToken != "", len(cfg.InternalToken))
	log.Printf("  REPO_DRIVER        = %s", cfg.RepoDriver)
	log.Printf("==========================================")

	validateConfig(cfg)

	// ── SMTP probe: verify Gmail credentials at startup ───────────────────────
	// Runs in a goroutine so it doesn't delay HTTP server start.
	// Look for "[smtp-probe] SUCCESS" or "[smtp-probe] FAILED" in the log.
	smtpProbePort, _ := strconv.Atoi(cfg.SMTPPort)
	if smtpProbePort == 0 {
		smtpProbePort = 587
	}
	go probeSMTP(cfg.SMTPHost, smtpProbePort, cfg.SMTPSender, cfg.SMTPPassword)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	js, err := mq.NewJetStream(cfg.NATSURL)
	if err != nil {
		log.Printf("failed to init NATS JetStream: %v", err)
	} else {
		defer js.Close()
	}

	// ── SMTP channel ──────────────────────────────────────────────────────────
	smtpPort, err := strconv.Atoi(cfg.SMTPPort)
	if err != nil || smtpPort == 0 {
		smtpPort = 587
	}
	emailChannel := smtpChannel.New(
		cfg.SMTPHost,
		smtpPort,
		cfg.SMTPSender,
		cfg.SMTPPassword,
		cfg.UserServiceURL,
		cfg.InternalToken,
	)

	var notificationRepo domain.Repository
	if cfg.RepoDriver == "postgres" {
		repo, err := postgres.New(ctx, cfg.DBURL)
		if err != nil {
			log.Printf("failed to init notification postgres repository: %v", err)
		} else {
			notificationRepo = repo
			defer notificationRepo.Close()
		}
	}

	uc := usecase.NewWithRepository(notificationRepo, emailChannel)
	if js != nil {
		worker := usecase.NewNotificationWorker(js, uc)
		go worker.Start(ctx)
	}

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	delivery.New(r, uc, cfg.InternalToken)
	r.Handle("/metrics", promhttp.Handler())

	log.Printf("notification-service listening on port %s", cfg.Port)
	if err := http.ListenAndServe(":"+cfg.Port, r); err != nil {
		log.Fatalf("failed to start server: %v", err)
	}
}

// probeSMTP dials smtp.gmail.com:587, upgrades to STARTTLS, and attempts
// PlainAuth with the configured credentials. The result is printed immediately
// so credential problems are visible without needing to submit an exchange
// request first.
func probeSMTP(host string, port int, sender, password string) {
	addr := fmt.Sprintf("%s:%d", host, port)
	log.Printf("[smtp-probe] ── probing %s (sender=%q) ──", addr, sender)

	if sender == "" || password == "" {
		log.Printf("[smtp-probe] SKIPPED — SMTP_SENDER or SMTP_PASSWORD is empty in config.env")
		return
	}

	conn, err := net.DialTimeout("tcp", addr, 15*time.Second)
	if err != nil {
		log.Printf("[smtp-probe] FAILED — TCP dial: %v", err)
		log.Printf("[smtp-probe] Check network connectivity to %s", addr)
		return
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(20 * time.Second))

	client, err := gosmtp.NewClient(conn, host)
	if err != nil {
		log.Printf("[smtp-probe] FAILED — SMTP client init: %v", err)
		return
	}
	defer client.Quit()

	if err := client.StartTLS(&tls.Config{ServerName: host}); err != nil {
		log.Printf("[smtp-probe] FAILED — STARTTLS: %v", err)
		return
	}

	auth := gosmtp.PlainAuth("", sender, password, host)
	if err := client.Auth(auth); err != nil {
		log.Printf("[smtp-probe] FAILED — Gmail rejected the App Password for %q: %v", sender, err)
		log.Printf("[smtp-probe] Checklist:")
		log.Printf("[smtp-probe]   1. Is 2-Step Verification enabled on %q?", sender)
		log.Printf("[smtp-probe]   2. Was the App Password generated at myaccount.google.com/apppasswords?")
		log.Printf("[smtp-probe]   3. Is SMTP_PASSWORD in config.env the exact 16-char password (no extra spaces after stripping)?")
		log.Printf("[smtp-probe]   4. Has the App Password been revoked or regenerated since it was added to config.env?")
		return
	}

	log.Printf("[smtp-probe] SUCCESS — Gmail accepted credentials for %q ✓", sender)
}

func validateConfig(cfg *config.Config) {
	if cfg.SMTPSender == "" || cfg.SMTPPassword == "" {
		log.Printf("WARNING: SMTP_SENDER or SMTP_PASSWORD is empty — email delivery will fail. " +
			"Check config.env.")
	}
	if cfg.AppEnv != "development" {
		if cfg.InternalToken == "" || cfg.InternalToken == "dev-internal-token" {
			log.Fatalf("INTERNAL_TOKEN must be set to a strong random value in non-development environments")
		}
	}
}
