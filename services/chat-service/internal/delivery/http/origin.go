package http

import (
	"net"
	"net/url"
	"strings"
)

func isOriginAllowed(origin string, allowed []string) bool {
	// If Origin is absent (non-browser clients), allow.
	if strings.TrimSpace(origin) == "" {
		return true
	}

	u, err := url.Parse(origin)
	if err != nil {
		return false
	}
	if u.Scheme == "" || u.Host == "" {
		return false
	}

	originScheme := strings.ToLower(u.Scheme)
	originHost := strings.ToLower(u.Hostname())
	originPort := u.Port()

	for _, raw := range allowed {
		raw = strings.TrimSpace(raw)
		if raw == "" {
			continue
		}
		if raw == "*" {
			return true
		}

		pu, err := url.Parse(raw)
		if err != nil || pu.Scheme == "" || pu.Host == "" {
			// If someone configured just a host, treat it as scheme-agnostic.
			if hostAllowed(originHost, raw) {
				return true
			}
			continue
		}

		if originScheme != strings.ToLower(pu.Scheme) {
			continue
		}

		pHost := strings.ToLower(pu.Hostname())
		if !hostAllowed(originHost, pHost) {
			continue
		}

		pPort := pu.Port()
		if pPort == "" {
			// Default ports: allow if origin omits port or matches default for scheme.
			if originPort == "" {
				return true
			}
			if originPort == defaultPort(originScheme) {
				return true
			}
			continue
		}

		if pPort == "*" {
			return true
		}
		if originPort == pPort {
			return true
		}
	}

	return false
}

func hostAllowed(originHost, patternHost string) bool {
	originHost = strings.ToLower(strings.TrimSpace(originHost))
	patternHost = strings.ToLower(strings.TrimSpace(patternHost))

	if originHost == "" || patternHost == "" {
		return false
	}

	// Exact match
	if originHost == patternHost {
		return true
	}

	// Wildcard subdomain match: *.example.com
	if strings.HasPrefix(patternHost, "*.") {
		suffix := strings.TrimPrefix(patternHost, "*")
		return strings.HasSuffix(originHost, suffix) && originHost != strings.TrimPrefix(suffix, ".")
	}

	// If configured as an IP, require exact match already handled.
	if net.ParseIP(patternHost) != nil {
		return false
	}

	return false
}

func defaultPort(scheme string) string {
	switch strings.ToLower(scheme) {
	case "http":
		return "80"
	case "https":
		return "443"
	default:
		return ""
	}
}
