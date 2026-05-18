package middleware

import (
	"net/http"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
)

// Tracing wraps the handler with OpenTelemetry instrumentation
func Tracing(serviceName string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return otelhttp.NewHandler(next, serviceName)
	}
}
