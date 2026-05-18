package config

import (
	"os"
	"strconv"
)

type Config struct {
	AppEnv                 string
	LogLevel               string
	Port                   string
	GRPCPort               string
	NATSURL                string
	RepoDriver             string
	RedisURL               string
	MatchTimeoutSec        int
	MatchFilterDropSec     int
	SearchRateLimitEnabled bool
	SearchRatePerSec       float64
	SearchRateBurst        int
	UserServiceURL         string
	ChatServiceURL         string
	InternalToken          string
	NotificationServiceURL string
}

func Load() *Config {
	return &Config{
		AppEnv:                 getEnv("APP_ENV", "development"),
		LogLevel:               getEnv("LOG_LEVEL", "info"),
		Port:                   getEnv("PORT", ""),
		GRPCPort:               getEnv("GRPC_PORT", "50082"),
		NATSURL:                getEnv("NATS_URL", "nats://nats:4222"),
		RepoDriver:             getEnv("REPO_DRIVER", "redis"), // memory|redis
		RedisURL:               getEnv("REDIS_URL", ""),
		MatchTimeoutSec:        getIntEnv("MATCH_TIMEOUT_SEC", 60),
		MatchFilterDropSec:     getIntEnv("MATCH_FILTER_DROP_SEC", 30),
		SearchRateLimitEnabled: getBoolEnv("SEARCH_RATE_LIMIT_ENABLED", true),
		SearchRatePerSec:       getFloatEnv("SEARCH_RATE_PER_SEC", 1.0),
		SearchRateBurst:        getIntEnv("SEARCH_RATE_BURST", 10),
		UserServiceURL:         getEnv("USER_SERVICE_URL", ""),
		ChatServiceURL:         getEnv("CHAT_SERVICE_URL", ""),
		InternalToken:          getEnv("INTERNAL_TOKEN", ""),
		NotificationServiceURL: getEnv("NOTIFICATION_SERVICE_URL", "http://notification-service:8085"),
	}
}

func getEnv(key, defaultValue string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultValue
}

func getIntEnv(key string, defaultValue int) int {
	if value, exists := os.LookupEnv(key); exists {
		if i, err := strconv.Atoi(value); err == nil {
			return i
		}
	}
	return defaultValue
}

func getFloatEnv(key string, defaultValue float64) float64 {
	if value, exists := os.LookupEnv(key); exists {
		if f, err := strconv.ParseFloat(value, 64); err == nil {
			return f
		}
	}
	return defaultValue
}

func getBoolEnv(key string, defaultValue bool) bool {
	if value, exists := os.LookupEnv(key); exists {
		switch value {
		case "1", "true", "TRUE", "True", "yes", "YES", "Yes", "on", "ON", "On":
			return true
		case "0", "false", "FALSE", "False", "no", "NO", "No", "off", "OFF", "Off":
			return false
		}
	}
	return defaultValue
}
