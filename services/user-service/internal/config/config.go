package config

import (
	"os"
	"time"
)

type Config struct {
	AppEnv         string
	LogLevel       string
	DBURL          string
	RedisURL       string
	RepoDriver     string
	JWTSecret      string
	JWTAccessTTL   time.Duration
	JWTRefreshTTL  time.Duration
	InternalToken      string
	Port               string
	GRPCPort           string
}

func Load() *Config {
	return &Config{
		AppEnv:         getEnv("APP_ENV", "development"),
		LogLevel:       getEnv("LOG_LEVEL", "info"),
		DBURL:          getEnv("DB_URL", ""),
		RedisURL:       getEnv("REDIS_URL", ""),
		RepoDriver:     getEnv("REPO_DRIVER", "postgres"), // memory|postgres
		JWTSecret:      getEnv("JWT_SECRET", ""),
		JWTAccessTTL:   getDurationEnv("JWT_ACCESS_TTL", 15*time.Minute),
		JWTRefreshTTL:  getDurationEnv("JWT_REFRESH_TTL", 168*time.Hour),
		InternalToken:    getEnv("INTERNAL_TOKEN", ""),
		Port:             getEnv("PORT", ""),
		GRPCPort:         getEnv("GRPC_PORT", "50081"),
	}
}

func getEnv(key, defaultValue string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultValue
}

func getDurationEnv(key string, defaultValue time.Duration) time.Duration {
	if value, exists := os.LookupEnv(key); exists {
		if d, err := time.ParseDuration(value); err == nil {
			return d
		}
	}
	return defaultValue
}
