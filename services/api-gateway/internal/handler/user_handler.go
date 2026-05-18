package handler

import (
	"encoding/json"
	"net/http"
	"github.com/QosmuratSamat0/pairexx/api-gateway/internal/config"
	"github.com/QosmuratSamat0/pairexx/api-gateway/internal/client"
	pbUser "github.com/QosmuratSamat0/pairexx/proto/user/v1"
	"github.com/go-chi/chi/v5"
	"github.com/rs/zerolog/log"
	"github.com/sony/gobreaker"
)

type UserHandler struct {
	cfg     *config.Config
	clients *client.GRPCClients
}

func NewUserHandler(cfg *config.Config, clients *client.GRPCClients) *UserHandler {
	return &UserHandler{cfg: cfg, clients: clients}
}

func (h *UserHandler) GetMe(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	result, err := h.clients.UserBreaker.Execute(func() (interface{}, error) {
		return h.clients.User.GetUser(r.Context(), &pbUser.GetUserRequest{UserId: userID})
	})

	if err != nil {
		if err == gobreaker.ErrOpenState {
			http.Error(w, "user-service unavailable", http.StatusServiceUnavailable)
			return
		}
		log.Error().Err(err).Str("user_id", userID).Msg("failed to get user profile via gRPC")
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func (h *UserHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "id")
	
	result, err := h.clients.UserBreaker.Execute(func() (interface{}, error) {
		return h.clients.User.GetUser(r.Context(), &pbUser.GetUserRequest{UserId: userID})
	})

	if err != nil {
		if err == gobreaker.ErrOpenState {
			http.Error(w, "user-service unavailable", http.StatusServiceUnavailable)
			return
		}
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func (h *UserHandler) UpdateMe(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req pbUser.UpdateProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	req.UserId = userID

	result, err := h.clients.UserBreaker.Execute(func() (interface{}, error) {
		return h.clients.User.UpdateProfile(r.Context(), &req)
	})

	if err != nil {
		if err == gobreaker.ErrOpenState {
			http.Error(w, "user-service unavailable", http.StatusServiceUnavailable)
			return
		}
		log.Error().Err(err).Str("user_id", userID).Msg("failed to update user profile via gRPC")
		http.Error(w, "failed to update profile", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}
