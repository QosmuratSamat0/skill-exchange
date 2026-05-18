package http

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/QosmuratSamat0/pairexx/user-service/internal/domain"
	"github.com/go-chi/chi/v5"
)

// ---------------------------------------------------------------------------
// Handler struct & constructor
// ---------------------------------------------------------------------------

type UserHandler struct {
	usecase       domain.UserUsecase
	internalToken string
}

func NewUserHandler(r chi.Router, usecase domain.UserUsecase, internalToken string) {
	h := &UserHandler{
		usecase:       usecase,
		internalToken: internalToken,
	}

	r.Route("/users", func(r chi.Router) {
		// --- Auth ---
		r.Post("/anonymous", h.CreateAnonymous)
		r.Post("/register", h.Register)
		r.Post("/login", h.Login)
		r.Post("/refresh", h.Refresh)
		r.Post("/logout", h.Logout)
		r.Post("/logout-all", h.LogoutAll)

		// --- Self (require X-User-ID header from upstream gateway/JWT middleware) ---
		r.Get("/me", h.GetMe)
		r.Put("/me", h.UpdateMe)
		r.Put("/me/profile", h.UpdateProfile)
		r.Patch("/me/preferences", h.UpdateEmailPreference)
		r.Get("/me/profile", h.GetMyProfile)
		r.Put("/me/password", h.ChangePassword)
		r.Delete("/me", h.DeleteAccount)
		r.Get("/me/sessions", h.GetSessions)

		// --- Public profiles & reviews ---
		r.Get("/{id}/profile", h.GetPublicProfile)
		r.Post("/{id}/review", h.AddReview)
		r.Get("/{id}/reviews", h.GetReviews)

		// --- Internal: ban status (legacy path kept) ---
		r.Get("/{id}/status", h.GetBanStatus)
	})

	// --- Internal/Admin routes ---
	r.Post("/internal/ban", h.BanUser)
	r.Post("/internal/unban", h.UnbanUser)
	r.Get("/internal/users", h.ListUsers)
	r.Get("/internal/users/{id}/bans", h.ListBans)
	r.Get("/internal/users/{id}/preferences", h.GetUserPreferences)

	// --- Health ---
	r.Get("/health", h.Health)
}

// ---------------------------------------------------------------------------
// Auth handlers
// ---------------------------------------------------------------------------

// POST /users/anonymous
func (h *UserHandler) CreateAnonymous(w http.ResponseWriter, r *http.Request) {
	var req struct {
		DeviceID string `json:"device_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.DeviceID == "" {
		jsonError(w, "device_id is required", http.StatusBadRequest)
		return
	}

	access, refresh, err := h.usecase.CreateAnonymous(r.Context(), req.DeviceID)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonOK(w, http.StatusOK, map[string]string{
		"access_token":  access,
		"refresh_token": refresh,
	})
}

// POST /users/register
func (h *UserHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.Email == "" || req.Password == "" {
		jsonError(w, "email and password are required", http.StatusBadRequest)
		return
	}

	if err := h.usecase.Register(r.Context(), req.Email, req.Password); err != nil {
		status := http.StatusInternalServerError
		if errors.Is(err, domain.ErrUserAlreadyExists) {
			status = http.StatusConflict
		}
		jsonError(w, err.Error(), status)
		return
	}
	jsonOK(w, http.StatusCreated, map[string]string{"message": "registered successfully"})
}

// POST /users/login
func (h *UserHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	access, refresh, err := h.usecase.Login(r.Context(), req.Email, req.Password)
	if err != nil {
		jsonError(w, "invalid credentials", http.StatusUnauthorized)
		return
	}
	jsonOK(w, http.StatusOK, map[string]string{
		"access_token":  access,
		"refresh_token": refresh,
	})
}

// POST /users/refresh
func (h *UserHandler) Refresh(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.RefreshToken == "" {
		jsonError(w, "refresh_token is required", http.StatusBadRequest)
		return
	}

	access, refresh, err := h.usecase.Refresh(r.Context(), req.RefreshToken)
	if err != nil {
		jsonError(w, "invalid or revoked token", http.StatusUnauthorized)
		return
	}
	jsonOK(w, http.StatusOK, map[string]string{
		"access_token":  access,
		"refresh_token": refresh,
	})
}

// POST /users/logout
func (h *UserHandler) Logout(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.RefreshToken == "" {
		jsonError(w, "refresh_token is required", http.StatusBadRequest)
		return
	}

	if err := h.usecase.Logout(r.Context(), req.RefreshToken); err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonOK(w, http.StatusOK, map[string]string{"message": "logged out"})
}

// POST /users/logout-all
func (h *UserHandler) LogoutAll(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		jsonError(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	if err := h.usecase.LogoutAll(r.Context(), userID); err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonOK(w, http.StatusOK, map[string]string{"message": "all sessions terminated"})
}

// ---------------------------------------------------------------------------
// Self / Profile handlers
// ---------------------------------------------------------------------------

// GET /users/me
func (h *UserHandler) GetMe(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		jsonError(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	user, err := h.usecase.GetMe(r.Context(), userID)
	if err != nil {
		jsonError(w, err.Error(), http.StatusNotFound)
		return
	}
	jsonOK(w, http.StatusOK, user)
}

// PUT /users/me
func (h *UserHandler) UpdateMe(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		jsonError(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		Gender    string   `json:"gender"`
		Interests []string `json:"interests"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if err := h.usecase.UpdateMe(r.Context(), userID, req.Gender, req.Interests); err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonOK(w, http.StatusOK, map[string]string{"message": "updated"})
}

// PUT /users/me/profile
func (h *UserHandler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		jsonError(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var profile domain.UserProfile
	if err := json.NewDecoder(r.Body).Decode(&profile); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if err := h.usecase.UpdateProfile(r.Context(), userID, &profile); err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonOK(w, http.StatusOK, map[string]string{"message": "profile updated"})
}

// GET /users/me/profile
func (h *UserHandler) GetMyProfile(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		jsonError(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	profile, err := h.usecase.GetUserProfile(r.Context(), userID)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonOK(w, http.StatusOK, profile)
}

// PUT /users/me/password
func (h *UserHandler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		jsonError(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req domain.PasswordChangeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.OldPassword == "" || req.NewPassword == "" {
		jsonError(w, "old_password and new_password are required", http.StatusBadRequest)
		return
	}
	if len(req.NewPassword) < 8 {
		jsonError(w, "new_password must be at least 8 characters", http.StatusBadRequest)
		return
	}

	if err := h.usecase.ChangePassword(r.Context(), userID, req.OldPassword, req.NewPassword); err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}
	jsonOK(w, http.StatusOK, map[string]string{"message": "password changed"})
}

// DELETE /users/me
func (h *UserHandler) DeleteAccount(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		jsonError(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req domain.DeleteAccountRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if err := h.usecase.DeleteAccount(r.Context(), userID, req.Password); err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}
	jsonOK(w, http.StatusOK, map[string]string{"message": "account deleted"})
}

// GET /users/me/sessions
func (h *UserHandler) GetSessions(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		jsonError(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	sessions, err := h.usecase.GetSessions(r.Context(), userID)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if sessions == nil {
		sessions = []*domain.UserSession{}
	}
	jsonOK(w, http.StatusOK, sessions)
}

// ---------------------------------------------------------------------------
// Public profile & review handlers
// ---------------------------------------------------------------------------

// GET /users/{id}/profile
func (h *UserHandler) GetPublicProfile(w http.ResponseWriter, r *http.Request) {
	targetID := chi.URLParam(r, "id")

	profile, err := h.usecase.GetPublicProfile(r.Context(), targetID)
	if err != nil {
		jsonError(w, err.Error(), http.StatusNotFound)
		return
	}
	jsonOK(w, http.StatusOK, profile)
}

// POST /users/{id}/review
func (h *UserHandler) AddReview(w http.ResponseWriter, r *http.Request) {
	fromUserID := r.Header.Get("X-User-ID")
	if fromUserID == "" {
		jsonError(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	toUserID := chi.URLParam(r, "id")

	var req struct {
		Rating  int    `json:"rating"`
		Comment string `json:"comment"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if err := h.usecase.AddReview(r.Context(), fromUserID, toUserID, req.Rating, req.Comment); err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}
	jsonOK(w, http.StatusCreated, map[string]string{"message": "review submitted"})
}

// GET /users/{id}/reviews
func (h *UserHandler) GetReviews(w http.ResponseWriter, r *http.Request) {
	targetID := chi.URLParam(r, "id")

	reviews, err := h.usecase.GetReviews(r.Context(), targetID)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if reviews == nil {
		reviews = []*domain.Review{}
	}
	jsonOK(w, http.StatusOK, reviews)
}

// ---------------------------------------------------------------------------
// Internal / Admin handlers
// ---------------------------------------------------------------------------

// GET /users/{id}/status  (internal)
func (h *UserHandler) GetBanStatus(w http.ResponseWriter, r *http.Request) {
	if !h.isInternalAuthorized(r) {
		jsonError(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	id := chi.URLParam(r, "id")
	ban, active, err := h.usecase.GetBanStatus(r.Context(), id)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonOK(w, http.StatusOK, map[string]interface{}{
		"is_banned": active,
		"ban":       ban,
	})
}

// POST /internal/ban  (internal)
func (h *UserHandler) BanUser(w http.ResponseWriter, r *http.Request) {
	if !h.isInternalAuthorized(r) {
		jsonError(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	var req struct {
		UserID   string `json:"user_id"`
		Reason   string `json:"reason"`
		BannedBy string `json:"banned_by"`
		Hours    int    `json:"hours"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.UserID == "" {
		jsonError(w, "user_id is required", http.StatusBadRequest)
		return
	}
	if req.Hours <= 0 {
		req.Hours = 24
	}

	duration := time.Duration(req.Hours) * time.Hour
	if err := h.usecase.BanUser(r.Context(), req.UserID, req.Reason, req.BannedBy, duration); err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonOK(w, http.StatusOK, map[string]string{"message": "user banned"})
}

// POST /internal/unban  (internal)
func (h *UserHandler) UnbanUser(w http.ResponseWriter, r *http.Request) {
	if !h.isInternalAuthorized(r) {
		jsonError(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	var req struct {
		UserID string `json:"user_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.UserID == "" {
		jsonError(w, "user_id is required", http.StatusBadRequest)
		return
	}

	if err := h.usecase.UnbanUser(r.Context(), req.UserID); err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonOK(w, http.StatusOK, map[string]string{"message": "user unbanned"})
}

// GET /internal/users  (internal) — supports ?limit=&offset= query params
func (h *UserHandler) ListUsers(w http.ResponseWriter, r *http.Request) {
	if !h.isInternalAuthorized(r) {
		jsonError(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	limit := queryInt(r, "limit", 20)
	offset := queryInt(r, "offset", 0)

	users, err := h.usecase.ListUsers(r.Context(), limit, offset)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if users == nil {
		users = []*domain.User{}
	}
	jsonOK(w, http.StatusOK, map[string]interface{}{
		"users":  users,
		"limit":  limit,
		"offset": offset,
	})
}

// GET /internal/users/{id}/bans  (internal)
func (h *UserHandler) ListBans(w http.ResponseWriter, r *http.Request) {
	if !h.isInternalAuthorized(r) {
		jsonError(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	userID := chi.URLParam(r, "id")

	bans, err := h.usecase.ListBans(r.Context(), userID)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if bans == nil {
		bans = []*domain.Ban{}
	}
	jsonOK(w, http.StatusOK, bans)
}

// PATCH /users/me/preferences
func (h *UserHandler) UpdateEmailPreference(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		jsonError(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var body struct {
		EmailNotificationsEnabled bool `json:"email_notifications_enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if err := h.usecase.UpdateEmailPreference(r.Context(), userID, body.EmailNotificationsEnabled); err != nil {
		jsonError(w, "failed to update preference", http.StatusInternalServerError)
		return
	}

	jsonOK(w, http.StatusOK, map[string]bool{"email_notifications_enabled": body.EmailNotificationsEnabled})
}

// GET /internal/users/{id}/preferences  (internal token protected)
//
// IMPORTANT: email_notifications_enabled is read via GetEmailPreference,
// which goes directly to Postgres rather than through the Redis profile
// cache. This prevents a stale cached profile (populated before migration
// 0004 added the column) from deserialising as false and silently
// suppressing every email notification for that user.
func (h *UserHandler) GetUserPreferences(w http.ResponseWriter, r *http.Request) {
	if !h.isInternalAuthorized(r) {
		jsonError(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	userID := chi.URLParam(r, "id")
	if userID == "" {
		jsonError(w, "missing user id", http.StatusBadRequest)
		return
	}

	user, err := h.usecase.GetMe(r.Context(), userID)
	if err != nil {
		jsonError(w, "user not found", http.StatusNotFound)
		return
	}

	// Direct DB read — bypasses Redis profile cache intentionally.
	emailNotifEnabled, err := h.usecase.GetEmailPreference(r.Context(), userID)
	if err != nil {
		// Default ON: better to send one extra email than to silently miss one.
		emailNotifEnabled = true
	}

	jsonOK(w, http.StatusOK, map[string]interface{}{
		"email":                       user.Email,
		"email_notifications_enabled": emailNotifEnabled,
	})
}

// GET /health
func (h *UserHandler) Health(w http.ResponseWriter, r *http.Request) {
	jsonOK(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func (h *UserHandler) isInternalAuthorized(r *http.Request) bool {
	if h.internalToken == "" {
		return false
	}
	return r.Header.Get("X-Internal-Token") == h.internalToken
}

// jsonError writes a JSON-encoded error response.
func jsonError(w http.ResponseWriter, message string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": message})
}

// jsonOK writes a JSON-encoded success response.
func jsonOK(w http.ResponseWriter, code int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(payload)
}

// queryInt reads an integer query parameter with a default fallback.
func queryInt(r *http.Request, key string, defaultVal int) int {
	raw := r.URL.Query().Get(key)
	if raw == "" {
		return defaultVal
	}
	v, err := strconv.Atoi(raw)
	if err != nil || v < 0 {
		return defaultVal
	}
	return v
}
