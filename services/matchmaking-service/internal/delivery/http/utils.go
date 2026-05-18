package http

import (
	"encoding/json"
	"net/http"
	"github.com/go-chi/chi/v5/middleware"
)

type ErrorResponse struct {
	Error     string `json:"error"`
	Message   string `json:"message"`
	RequestID string `json:"request_id,omitempty"`
}

func RespondWithError(w http.ResponseWriter, r *http.Request, code int, errStr, message string) {
	reqID := r.Header.Get("X-Request-ID")
	if reqID == "" {
		reqID = middleware.GetReqID(r.Context())
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	
	json.NewEncoder(w).Encode(ErrorResponse{
		Error:     errStr,
		Message:   message,
		RequestID: reqID,
	})
}

func RespondWithJSON(w http.ResponseWriter, code int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(payload)
}
