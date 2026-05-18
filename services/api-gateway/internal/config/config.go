package config

import (
	"os"
	"strings"
)

type Config struct {
	AppEnv                     string
	LogLevel                   string
	Port                       string
	RedisURL                   string
	JWTSecret                  string
	UserServiceURL             string
	MatchmakingServiceURL      string
	ChatServiceURL             string
	ModerationServiceURL       string
	NotificationServiceURL     string
	UserServiceGRPCAddr        string
	MatchmakingServiceGRPCAddr string
	AllowedOrigins             []string
	DevAllowedOrigins          []string
	InternalToken              string
	OTELCollectorURL           string
}

func Load() *Config {
	return &Config{
		AppEnv:                     getEnv("APP_ENV", "development"),
		LogLevel:                   getEnv("LOG_LEVEL", "info"),
		Port:                       getEnv("PORT", ""),
		RedisURL:                   getEnv("REDIS_URL", ""),
		JWTSecret:                  getEnv("JWT_SECRET", ""),
		UserServiceURL:             getEnv("USER_SERVICE_URL", ""),
		MatchmakingServiceURL:      getEnv("MATCHMAKING_SERVICE_URL", ""),
		ChatServiceURL:             getEnv("CHAT_SERVICE_URL", ""),
		ModerationServiceURL:       getEnv("MODERATION_SERVICE_URL", ""),
		NotificationServiceURL:     getEnv("NOTIFICATION_SERVICE_URL", ""),
		UserServiceGRPCAddr:        getEnv("USER_SERVICE_GRPC_ADDR", "user-service:50081"),
		MatchmakingServiceGRPCAddr: getEnv("MATCHMAKING_SERVICE_GRPC_ADDR", "matchmaking-service:50082"),
		AllowedOrigins:             parseCSVEnv("ALLOWED_ORIGINS"),
		DevAllowedOrigins:          parseCSVEnv("DEV_ALLOWED_ORIGINS"),
		InternalToken:              getEnv("INTERNAL_TOKEN", ""),
		OTELCollectorURL:           getEnv("OTEL_COLLECTOR_URL", ""),
	}
}

func getEnv(key, defaultValue string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultValue
}

func parseCSVEnv(key string) []string {
	raw, exists := os.LookupEnv(key)
	if !exists {
		return nil
	}

	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		value := strings.TrimSpace(part)
		if value == "" {
			continue
		}
		out = append(out, value)
	}
	return out
}
