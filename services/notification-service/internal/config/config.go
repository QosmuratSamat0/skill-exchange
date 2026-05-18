package config

import (
	"os"
	"strings"
)

type Config struct {
	AppEnv         string
	LogLevel       string
	Port           string
	InternalToken  string
	RepoDriver     string
	DBURL          string
	SMTPHost       string
	SMTPPort       string
	SMTPSender     string
	SMTPPassword   string
	UserServiceURL string
	NATSURL        string
}

func Load() *Config {
	return &Config{
		AppEnv:        getEnv("APP_ENV", "development"),
		LogLevel:      getEnv("LOG_LEVEL", "info"),
		Port:          getEnv("PORT", ""),
		InternalToken: getEnv("INTERNAL_TOKEN", ""),
		RepoDriver:    getEnv("REPO_DRIVER", "postgres"),
		DBURL:         getEnv("DB_URL", ""),

		// ── SMTP ─────────────────────────────────────────────────────────────
		SMTPHost: getEnv("SMTP_HOST", "smtp.gmail.com"),
		SMTPPort: getEnv("SMTP_PORT", "587"),
		// Sender and password intentionally have NO compiled-in fallback so that
		// a missing config.env causes an obvious empty-value startup log rather
		// than silently using a stale credential baked into the binary.
		SMTPSender: getEnv("SMTP_SENDER", ""),
		// Spaces are stripped here: the App Password is stored grouped for
		// readability ("imjl acvw asix opqm") in config.env.
		SMTPPassword: strings.ReplaceAll(getEnv("SMTP_PASSWORD", ""), " ", ""),

		// ── Service routing ───────────────────────────────────────────────────
		// Default is localhost:8081 for local development (go run . / make backend-dev).
		// Switch to http://user-service:8081 when running inside Docker compose.
		UserServiceURL: getEnv("USER_SERVICE_URL", "http://localhost:8081"),

		NATSURL: getEnv("NATS_URL", "nats://nats:4222"),
	}
}

func getEnv(key, defaultValue string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultValue
}
