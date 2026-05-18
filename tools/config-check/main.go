// config-check validates that config.env exists and contains every variable
// that the notification and matchmaking services require at startup.
//
// Usage (from workspace root):
//
//	go run ./tools/config-check
//
// Exit codes:
//
//	0 — all required variables are present and non-empty
//	1 — file missing or one or more variables are absent/empty
package main

import (
	"bufio"
	"fmt"
	"os"
	"strings"
)

// required lists every variable that must be non-empty in config.env.
var required = []string{
	"SMTP_SENDER",
	"SMTP_PASSWORD",
	"USER_SERVICE_URL",
	"NOTIFICATION_SERVICE_URL",
}

func main() {
	const filename = "config.env"

	f, err := os.Open(filename)
	if err != nil {
		fmt.Println()
		fmt.Println("ERROR: config.env not found.")
		fmt.Println("Run:   cp config.env.example config.env")
		fmt.Println("       (then fill in SMTP_SENDER and SMTP_PASSWORD)")
		fmt.Println()
		os.Exit(1)
	}
	defer f.Close()

	// Parse KEY=VALUE lines; strip comments and blank lines.
	vars := make(map[string]string)
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		value = strings.TrimSpace(value)
		// Strip surrounding quotes (single or double).
		value = strings.Trim(value, `"'`)
		// Strip spaces — the SMTP App Password is stored grouped for readability
		// ("imjl acvw asix opqm") and the service config also strips them; we
		// mirror that here so the emptiness check works correctly.
		value = strings.ReplaceAll(value, " ", "")
		vars[key] = value
	}
	if err := scanner.Err(); err != nil {
		fmt.Fprintf(os.Stderr, "ERROR: could not read %s: %v\n", filename, err)
		os.Exit(1)
	}

	// Check every required variable.
	var missing []string
	for _, key := range required {
		if vars[key] == "" {
			missing = append(missing, key)
		}
	}

	if len(missing) > 0 {
		fmt.Println()
		fmt.Println("ERROR: the following required variables are missing or empty in config.env:")
		for _, key := range missing {
			fmt.Printf("  %s\n", key)
		}
		fmt.Println()
		fmt.Printf("Edit config.env and set these variables, then re-run 'make %s'.\n", os.Args[0])
		fmt.Println()
		os.Exit(1)
	}

	fmt.Println("config.env OK")
}
