package http

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-playground/validator/v10"
	"golang.org/x/time/rate"

	"github.com/QosmuratSamat0/pairexx/matchmaking-service/internal/config"
	"github.com/QosmuratSamat0/pairexx/matchmaking-service/internal/domain"
)

// ---------------------------------------------------------------------------
// Handler struct
// ---------------------------------------------------------------------------

type MatchHandler struct {
	usecase  domain.MatchUsecase
	validate *validator.Validate
	limiters map[string]*rate.Limiter
	mu       sync.Mutex
	cfg      *config.Config
}

// ---------------------------------------------------------------------------
// Router registration  (18 endpoints)
// ---------------------------------------------------------------------------

func NewMatchHandler(r chi.Router, usecase domain.MatchUsecase, cfg *config.Config) {
	h := &MatchHandler{
		usecase:  usecase,
		validate: validator.New(),
		limiters: make(map[string]*rate.Limiter),
		cfg:      cfg,
	}

	r.Route("/match", func(r chi.Router) {
		// ── Profile ──────────────────────────────────────────────────────────
		r.Put("/profile", h.UpdateProfile)           // update / create profile
		r.Get("/profile", h.GetMyProfile)            // get own profile
		r.Delete("/profile", h.DeleteProfile)        // delete own profile
		r.Get("/profile/{userID}", h.GetProfileByID) // get any profile

		// ── Candidate discovery ───────────────────────────────────────────────
		r.Get("/candidates", h.GetCandidates)                         // smart SINTER match
		r.Get("/candidates/skill/{skill}", h.SearchCandidatesBySkill) // by specific skill

		// ── Exchange requests ─────────────────────────────────────────────────
		r.Post("/request", h.SendRequest)                  // send a new request
		r.Get("/requests/incoming", h.GetIncomingRequests) // my inbox
		r.Get("/requests/sent", h.GetSentRequests)         // my outbox
		r.Post("/request/{id}/accept", h.AcceptRequest)    // accept
		r.Post("/request/{id}/decline", h.DeclineRequest)  // decline
		r.Post("/requests/{id}/complete", h.CompleteRequest)
		r.Delete("/request/{id}", h.CancelRequest) // cancel (sender only)

		// ── Rooms ────────────────────────────────────────────────────────────
		r.Get("/room", h.GetMyRoom)    // current active room
		r.Get("/rooms", h.GetAllRooms) // history of all rooms

		// ── Status & Stats ───────────────────────────────────────────────────
		r.Put("/status", h.SetOnlineStatus)        // set online/offline
		r.Get("/status/{userID}", h.GetUserStatus) // read any user's status
		r.Get("/stats", h.GetMyStats)              // my match stats

		// ── SSE ──────────────────────────────────────────────────────────────
		r.Get("/notifications", h.NotificationsSSE)
	})

	// ── Health ────────────────────────────────────────────────────────────────
	r.Get("/health", h.Health)
}

// ---------------------------------------------------------------------------
// Rate-limiter helper
// ---------------------------------------------------------------------------

func (h *MatchHandler) limiter(userID string) *rate.Limiter {
	h.mu.Lock()
	defer h.mu.Unlock()
	if l, ok := h.limiters[userID]; ok {
		return l
	}
	rps := rate.Limit(h.cfg.SearchRatePerSec)
	burst := h.cfg.SearchRateBurst
	if burst == 0 {
		burst = 10
	}
	l := rate.NewLimiter(rps, burst)
	h.limiters[userID] = l
	return l
}

// requireUserID reads X-User-ID header and writes 401 if absent.
// Returns ("", false) on failure so callers can just `return`.
func (h *MatchHandler) requireUserID(w http.ResponseWriter, r *http.Request) (string, bool) {
	uid := strings.TrimSpace(r.Header.Get("X-User-ID"))
	if uid == "" {
		RespondWithError(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "X-User-ID header is required")
		return "", false
	}
	return uid, true
}

// ---------------------------------------------------------------------------
// Profile endpoints
// ---------------------------------------------------------------------------

// PUT /match/profile
func (h *MatchHandler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireUserID(w, r)
	if !ok {
		return
	}

	var p domain.Profile
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		RespondWithError(w, r, http.StatusBadRequest, "BAD_REQUEST", "invalid JSON body")
		return
	}
	p.UserID = userID

	if err := h.validate.Struct(p); err != nil {
		RespondWithError(w, r, http.StatusBadRequest, "VALIDATION_ERROR", err.Error())
		return
	}

	if err := h.usecase.UpdateProfile(r.Context(), &p); err != nil {
		RespondWithError(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	RespondWithJSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

// GET /match/profile
func (h *MatchHandler) GetMyProfile(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireUserID(w, r)
	if !ok {
		return
	}

	p, err := h.usecase.GetProfile(r.Context(), userID)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			RespondWithError(w, r, http.StatusNotFound, "NOT_FOUND", err.Error())
			return
		}
		RespondWithError(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	RespondWithJSON(w, http.StatusOK, p)
}

// DELETE /match/profile
func (h *MatchHandler) DeleteProfile(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireUserID(w, r)
	if !ok {
		return
	}

	if err := h.usecase.DeleteProfile(r.Context(), userID); err != nil {
		RespondWithError(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// GET /match/profile/{userID}
func (h *MatchHandler) GetProfileByID(w http.ResponseWriter, r *http.Request) {
	// The caller still needs to be authenticated.
	if _, ok := h.requireUserID(w, r); !ok {
		return
	}

	targetID := chi.URLParam(r, "userID")
	if targetID == "" {
		RespondWithError(w, r, http.StatusBadRequest, "BAD_REQUEST", "userID path parameter is required")
		return
	}

	p, err := h.usecase.GetProfile(r.Context(), targetID)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			RespondWithError(w, r, http.StatusNotFound, "NOT_FOUND", err.Error())
			return
		}
		RespondWithError(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	RespondWithJSON(w, http.StatusOK, p)
}

// ---------------------------------------------------------------------------
// Candidate / discovery endpoints
// ---------------------------------------------------------------------------

// GET /match/candidates
func (h *MatchHandler) GetCandidates(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireUserID(w, r)
	if !ok {
		return
	}

	if h.cfg.SearchRateLimitEnabled && !h.limiter(userID).Allow() {
		RespondWithError(w, r, http.StatusTooManyRequests, "RATE_LIMITED", "too many candidate search requests")
		return
	}

	candidates, err := h.usecase.GetCandidates(r.Context(), userID)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			RespondWithError(w, r, http.StatusNotFound, "NOT_FOUND", err.Error())
			return
		}
		RespondWithError(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	RespondWithJSON(w, http.StatusOK, candidates)
}

// GET /match/candidates/skill/{skill}
func (h *MatchHandler) SearchCandidatesBySkill(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireUserID(w, r)
	if !ok {
		return
	}

	if h.cfg.SearchRateLimitEnabled && !h.limiter(userID).Allow() {
		RespondWithError(w, r, http.StatusTooManyRequests, "RATE_LIMITED", "too many candidate search requests")
		return
	}

	skill := chi.URLParam(r, "skill")
	if skill == "" {
		RespondWithError(w, r, http.StatusBadRequest, "BAD_REQUEST", "skill path parameter is required")
		return
	}

	profiles, err := h.usecase.SearchCandidatesBySkill(r.Context(), skill)
	if err != nil {
		RespondWithError(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	RespondWithJSON(w, http.StatusOK, profiles)
}

// ---------------------------------------------------------------------------
// Exchange-request endpoints
// ---------------------------------------------------------------------------

// POST /match/request
func (h *MatchHandler) SendRequest(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireUserID(w, r)
	if !ok {
		return
	}

	var body struct {
		ToUserID string `json:"to_user_id" validate:"required"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		RespondWithError(w, r, http.StatusBadRequest, "BAD_REQUEST", "invalid JSON body")
		return
	}
	if err := h.validate.Struct(body); err != nil {
		RespondWithError(w, r, http.StatusBadRequest, "VALIDATION_ERROR", err.Error())
		return
	}

	if err := h.usecase.SendRequest(r.Context(), userID, body.ToUserID); err != nil {
		code := http.StatusInternalServerError
		if strings.Contains(err.Error(), "yourself") {
			code = http.StatusBadRequest
		}
		RespondWithError(w, r, code, "REQUEST_ERROR", err.Error())
		return
	}

	// Fire-and-forget: notify the recipient via notification-service.
	toUserID := body.ToUserID
	fromUserID := userID
	senderProfile, _ := h.usecase.GetProfile(r.Context(), fromUserID)
	senderName := "A Pairexx member"
	if senderProfile != nil && senderProfile.Name != "" {
		senderName = senderProfile.Name
	}
	go h.dispatchExchangeNotification(toUserID, fromUserID, senderName)

	RespondWithJSON(w, http.StatusAccepted, map[string]string{"status": "request sent"})
}

// dispatchExchangeNotification asynchronously calls the notification-service
// to alert the recipient of a new skill exchange request via email (if enabled).
// This runs in a goroutine — all errors are logged but never block the request.
func (h *MatchHandler) dispatchExchangeNotification(toUserID, fromUserID, fromUserName string) {
	if h.cfg.NotificationServiceURL == "" {
		fmt.Println("[matchmaking] NOTIFICATION_SERVICE_URL is not set — skipping email dispatch")
		return
	}

	payload := map[string]interface{}{
		"type":    "exchange_request",
		"user_id": toUserID,
		"payload": map[string]interface{}{
			"from_user_id":   fromUserID,
			"from_user_name": fromUserName,
		},
	}

	data, err := json.Marshal(payload)
	if err != nil {
		fmt.Printf("[matchmaking] failed to marshal notification payload: %v\n", err)
		return
	}

	targetURL := h.cfg.NotificationServiceURL + "/notify"
	fmt.Printf("[matchmaking] dispatching exchange_request notification → %s (to_user=%s)\n", targetURL, toUserID)

	req, err := http.NewRequestWithContext(context.Background(), http.MethodPost, targetURL, bytes.NewReader(data))
	if err != nil {
		fmt.Printf("[matchmaking] failed to build notification request: %v\n", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Token", h.cfg.InternalToken)

	// 10-second timeout: notification-service responds with 202 immediately
	// after our async-dispatch fix, so 10 s is ample.
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		fmt.Printf("[matchmaking] notification request FAILED: %v\n", err)
		return
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode >= 300 {
		fmt.Printf("[matchmaking] notification service returned HTTP %d: %s\n", resp.StatusCode, string(body))
		return
	}

	fmt.Printf("[matchmaking] notification queued OK (HTTP %d)\n", resp.StatusCode)
}

// GET /match/requests/incoming
func (h *MatchHandler) GetIncomingRequests(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireUserID(w, r)
	if !ok {
		return
	}

	requests, err := h.usecase.GetMyRequests(r.Context(), userID)
	if err != nil {
		RespondWithError(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	RespondWithJSON(w, http.StatusOK, requests)
}

// GET /match/requests/sent
func (h *MatchHandler) GetSentRequests(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireUserID(w, r)
	if !ok {
		return
	}

	requests, err := h.usecase.GetSentRequests(r.Context(), userID)
	if err != nil {
		RespondWithError(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	RespondWithJSON(w, http.StatusOK, requests)
}

// POST /match/request/{id}/accept
func (h *MatchHandler) AcceptRequest(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireUserID(w, r)
	if !ok {
		return
	}

	reqID := chi.URLParam(r, "id")
	if reqID == "" {
		RespondWithError(w, r, http.StatusBadRequest, "BAD_REQUEST", "request ID is required")
		return
	}

	if err := h.usecase.AcceptRequest(r.Context(), userID, reqID); err != nil {
		code := http.StatusInternalServerError
		if strings.Contains(err.Error(), "not found") {
			code = http.StatusNotFound
		} else if strings.Contains(err.Error(), "already processed") {
			code = http.StatusConflict
		}
		RespondWithError(w, r, code, "ACCEPT_ERROR", err.Error())
		return
	}

	RespondWithJSON(w, http.StatusOK, map[string]string{"status": "request accepted"})
}

// POST /match/request/{id}/decline
func (h *MatchHandler) DeclineRequest(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireUserID(w, r)
	if !ok {
		return
	}

	reqID := chi.URLParam(r, "id")
	if reqID == "" {
		RespondWithError(w, r, http.StatusBadRequest, "BAD_REQUEST", "request ID is required")
		return
	}

	if err := h.usecase.DeclineRequest(r.Context(), userID, reqID); err != nil {
		code := http.StatusInternalServerError
		if strings.Contains(err.Error(), "not found") {
			code = http.StatusNotFound
		} else if strings.Contains(err.Error(), "already processed") {
			code = http.StatusConflict
		}
		RespondWithError(w, r, code, "DECLINE_ERROR", err.Error())
		return
	}

	RespondWithJSON(w, http.StatusOK, map[string]string{"status": "request declined"})
}

// POST /match/requests/{id}/complete
func (h *MatchHandler) CompleteRequest(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireUserID(w, r)
	if !ok {
		return
	}

	reqID := chi.URLParam(r, "id")
	if reqID == "" {
		RespondWithError(w, r, http.StatusBadRequest, "BAD_REQUEST", "request ID is required")
		return
	}

	req, err := h.usecase.CompleteRequest(r.Context(), userID, reqID)
	if err != nil {
		code := http.StatusInternalServerError
		if strings.Contains(err.Error(), "not found") {
			code = http.StatusNotFound
		} else if strings.Contains(err.Error(), "participants") {
			code = http.StatusForbidden
		} else if strings.Contains(err.Error(), "accepted") {
			code = http.StatusConflict
		}
		RespondWithError(w, r, code, "COMPLETE_ERROR", err.Error())
		return
	}

	RespondWithJSON(w, http.StatusOK, req)
}

// DELETE /match/request/{id}
func (h *MatchHandler) CancelRequest(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireUserID(w, r)
	if !ok {
		return
	}

	reqID := chi.URLParam(r, "id")
	if reqID == "" {
		RespondWithError(w, r, http.StatusBadRequest, "BAD_REQUEST", "request ID is required")
		return
	}

	if err := h.usecase.CancelRequest(r.Context(), userID, reqID); err != nil {
		code := http.StatusInternalServerError
		if strings.Contains(err.Error(), "not found") {
			code = http.StatusNotFound
		} else if strings.Contains(err.Error(), "only the sender") {
			code = http.StatusForbidden
		} else if strings.Contains(err.Error(), "only pending") {
			code = http.StatusConflict
		}
		RespondWithError(w, r, code, "CANCEL_ERROR", err.Error())
		return
	}

	RespondWithJSON(w, http.StatusOK, map[string]string{"status": "request cancelled"})
}

// ---------------------------------------------------------------------------
// Room endpoints
// ---------------------------------------------------------------------------

// GET /match/room
func (h *MatchHandler) GetMyRoom(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireUserID(w, r)
	if !ok {
		return
	}

	room, err := h.usecase.GetMyRoom(r.Context(), userID)
	if err != nil {
		if strings.Contains(err.Error(), "no active room") {
			RespondWithError(w, r, http.StatusNotFound, "NOT_FOUND", err.Error())
			return
		}
		RespondWithError(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	RespondWithJSON(w, http.StatusOK, room)
}

// GET /match/rooms
func (h *MatchHandler) GetAllRooms(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireUserID(w, r)
	if !ok {
		return
	}

	rooms, err := h.usecase.GetAllRooms(r.Context(), userID)
	if err != nil {
		RespondWithError(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	RespondWithJSON(w, http.StatusOK, rooms)
}

// ---------------------------------------------------------------------------
// Status & stats endpoints
// ---------------------------------------------------------------------------

// PUT /match/status
// Body: {"online": true}
func (h *MatchHandler) SetOnlineStatus(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireUserID(w, r)
	if !ok {
		return
	}

	var body struct {
		Online bool `json:"online"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		RespondWithError(w, r, http.StatusBadRequest, "BAD_REQUEST", "invalid JSON body")
		return
	}

	if err := h.usecase.SetOnlineStatus(r.Context(), userID, body.Online); err != nil {
		RespondWithError(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	RespondWithJSON(w, http.StatusOK, map[string]interface{}{
		"user_id": userID,
		"online":  body.Online,
		"status":  "updated",
	})
}

// GET /match/status/{userID}
func (h *MatchHandler) GetUserStatus(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireUserID(w, r); !ok {
		return
	}

	targetID := chi.URLParam(r, "userID")
	if targetID == "" {
		RespondWithError(w, r, http.StatusBadRequest, "BAD_REQUEST", "userID path parameter is required")
		return
	}

	status, err := h.usecase.GetUserStatus(r.Context(), targetID)
	if err != nil {
		RespondWithError(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	RespondWithJSON(w, http.StatusOK, status)
}

// GET /match/stats
func (h *MatchHandler) GetMyStats(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireUserID(w, r)
	if !ok {
		return
	}

	stats, err := h.usecase.GetStats(r.Context(), userID)
	if err != nil {
		RespondWithError(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	RespondWithJSON(w, http.StatusOK, stats)
}

// ---------------------------------------------------------------------------
// SSE notifications endpoint
// ---------------------------------------------------------------------------

// GET /match/notifications
func (h *MatchHandler) NotificationsSSE(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireUserID(w, r)
	if !ok {
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		RespondWithError(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "streaming not supported by this server")
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no") // nginx: disable proxy buffering

	ch, cleanup, err := h.usecase.SubscribeToNotifications(r.Context(), userID)
	if err != nil {
		RespondWithError(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	defer cleanup()

	// Send a comment as keep-alive / connection confirmation
	fmt.Fprintf(w, ": connected user=%s\n\n", userID)
	flusher.Flush()

	for {
		select {
		case <-r.Context().Done():
			return
		case note, open := <-ch:
			if !open {
				return
			}
			payload, _ := json.Marshal(note)
			fmt.Fprintf(w, "data: %s\n\n", payload)
			flusher.Flush()
		}
	}
}

// ---------------------------------------------------------------------------
// Health endpoint
// ---------------------------------------------------------------------------

// GET /health
func (h *MatchHandler) Health(w http.ResponseWriter, r *http.Request) {
	if err := h.usecase.HealthCheck(r.Context()); err != nil {
		RespondWithJSON(w, http.StatusServiceUnavailable, map[string]string{
			"status": "unhealthy",
			"error":  err.Error(),
		})
		return
	}
	RespondWithJSON(w, http.StatusOK, map[string]string{"status": "healthy"})
}
