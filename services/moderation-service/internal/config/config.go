package config

import (
	"os"
)

type Config struct {
	AppEnv                 string
	LogLevel               string
	Port                   string
	DBURL                  string
	RepoDriver             string
	UserServiceURL         string
	ChatServiceURL         string
	NotificationServiceURL string
	InternalToken          string
	ToxicWords             []string
}

func Load() *Config {
	return &Config{
		AppEnv:                 getEnv("APP_ENV", "development"),
		LogLevel:               getEnv("LOG_LEVEL", "info"),
		Port:                   getEnv("PORT", ""),
		DBURL:                  getEnv("DB_URL", ""),
		RepoDriver:             getEnv("REPO_DRIVER", "postgres"), // memory|postgres
		UserServiceURL:         getEnv("USER_SERVICE_URL", ""),
		ChatServiceURL:         getEnv("CHAT_SERVICE_URL", ""),
		NotificationServiceURL: getEnv("NOTIFICATION_SERVICE_URL", ""),
		InternalToken:          getEnv("INTERNAL_TOKEN", ""),
		ToxicWords:             splitCSV(getEnv("TOXIC_WORDS", "")),
	}
}

func getEnv(key, defaultValue string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultValue
}

func splitCSV(s string) []string {
	var out []string
	cur := ""
	for _, r := range s {
		if r == ',' {
			if cur != "" {
				out = append(out, cur)
			}
			cur = ""
			continue
		}
		cur += string(r)
	}
	if cur != "" {
		out = append(out, cur)
	}
	return out
}
