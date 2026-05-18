package middleware

import (
	"net/http"
	"strings"
)

// DenyInternal blocks any request that attempts to reach internal endpoints.
// Internal endpoints must be accessible only inside the docker network and never via gateway.
func DenyInternal(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := r.URL.Path
		// For gateway proxied requests:
		// /api/v1/<service>/<...> is trimmed to /<service>/<...> in proxy director,
		// so we need to block both forms.
		if strings.Contains(p, "/internal") {
			http.NotFound(w, r)
			return
		}
		next.ServeHTTP(w, r)
	})
}

