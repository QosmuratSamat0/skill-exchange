package http

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/QosmuratSamat0/pairexx/moderation-service/internal/domain"
)

type Handler struct {
	uc            domain.ModerationUsecase
	internalToken string
}

func New(r chi.Router, uc domain.ModerationUsecase, internalToken string) {
	h := &Handler{uc: uc, internalToken: internalToken}

	r.Route("/report", func(r chi.Router) {
		r.Post("/report", h.CreateReport)
		r.Get("/reports/{id}", h.GetReport)

		r.Route("/admin", func(r chi.Router) {
			r.Get("/reports", h.ListReports)
		})
	})

	r.Post("/moderate/message", h.ModerateMessage)

	r.Get("/health", h.Health)
}

func (h *Handler) CreateReport(w http.ResponseWriter, r *http.Request) {
	reporter := r.Header.Get("X-User-ID")
	if reporter == "" {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		RoomID         string `json:"room_id"`
		ReportedUserID string `json:"reported_user_id"`
		Reason         string `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	rep, counts, err := h.uc.CreateReport(r.Context(), reporter, req.ReportedUserID, req.RoomID, req.Reason)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"report": rep,
		"counts": counts,
	})
}

func (h *Handler) GetReport(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	rep, err := h.uc.GetReport(r.Context(), id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	_ = json.NewEncoder(w).Encode(rep)
}

func (h *Handler) ListReports(w http.ResponseWriter, r *http.Request) {
	if !h.isInternalAuthorized(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	reps, err := h.uc.ListReports(r.Context(), 100)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	_ = json.NewEncoder(w).Encode(reps)
}

func (h *Handler) ModerateMessage(w http.ResponseWriter, r *http.Request) {
	if !h.isInternalAuthorized(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	toxic, err := h.uc.ModerateMessage(r.Context(), req.Content)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	_ = json.NewEncoder(w).Encode(map[string]any{"toxic": toxic})
}

func (h *Handler) Health(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("OK"))
}

func (h *Handler) isInternalAuthorized(r *http.Request) bool {
	if h.internalToken == "" {
		return false
	}
	return r.Header.Get("X-Internal-Token") == h.internalToken
}

