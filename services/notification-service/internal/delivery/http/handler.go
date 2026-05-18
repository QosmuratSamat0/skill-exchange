package http

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/rs/zerolog/log"

	"github.com/QosmuratSamat0/pairexx/notification-service/internal/domain"
)

type Handler struct {
	uc            domain.Usecase
	internalToken string
}

func New(r chi.Router, uc domain.Usecase, internalToken string) {
	h := &Handler{uc: uc, internalToken: internalToken}
	r.Post("/notify", h.Notify)
	r.Get("/notifications", h.ListNotifications)
	r.Get("/health", h.Health)
}

// Notify accepts an incoming notification request, validates it, replies with
// 202 Accepted immediately, and then dispatches the actual delivery work in a
// background goroutine.
//
// Why the goroutine? SMTP delivery (STARTTLS handshake + auth + DATA) can take
// several seconds.  The caller (matchmaking-service) uses a short HTTP timeout
// on its outbound client.  If we block the HTTP response until SMTP finishes,
// the caller's context times out, closes the connection, which cancels
// r.Context(), which propagates into the SMTP channel and kills the TCP session
// to Gmail mid-flight → no email is ever sent.
//
// The goroutine uses context.Background() with its own 30-second deadline so
// SMTP I/O is completely decoupled from the HTTP connection lifetime.
func (h *Handler) Notify(w http.ResponseWriter, r *http.Request) {
	if !h.isInternalAuthorized(r) {
		log.Warn().Str("remote", r.RemoteAddr).Msg("[notify] rejected: invalid internal token")
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var n domain.Notification
	if err := json.NewDecoder(r.Body).Decode(&n); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if n.Type == "" || n.UserID == "" {
		http.Error(w, "type and user_id are required", http.StatusBadRequest)
		return
	}

	log.Info().
		Str("type", n.Type).
		Str("user_id", n.UserID).
		Msg("[notify] received — dispatching asynchronously")

	// ── Respond immediately so the caller is not blocked by SMTP I/O ──────
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	_ = json.NewEncoder(w).Encode(map[string]any{"status": "queued"})

	// ── Background delivery — isolated from the HTTP connection context ────
	go func(notification domain.Notification) {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		if err := h.uc.Notify(ctx, notification); err != nil {
			log.Error().
				Err(err).
				Str("type", notification.Type).
				Str("user_id", notification.UserID).
				Msg("[notify] background dispatch error")
			return
		}

		log.Info().
			Str("type", notification.Type).
			Str("user_id", notification.UserID).
			Msg("[notify] background dispatch completed")
	}(n)
}

func (h *Handler) Health(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("OK"))
}

func (h *Handler) ListNotifications(w http.ResponseWriter, r *http.Request) {
	userID := strings.TrimSpace(r.Header.Get("X-User-ID"))
	if userID == "" {
		http.Error(w, "X-User-ID header is required", http.StatusUnauthorized)
		return
	}

	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	items, err := h.uc.ListForUser(r.Context(), userID, limit)
	if err != nil {
		log.Error().Err(err).Str("user_id", userID).Msg("[notifications] list failed")
		http.Error(w, "failed to list notifications", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(items)
}

func (h *Handler) isInternalAuthorized(r *http.Request) bool {
	if h.internalToken == "" {
		return false
	}
	return r.Header.Get("X-Internal-Token") == h.internalToken
}
