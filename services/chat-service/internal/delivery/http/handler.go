package http

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/QosmuratSamat0/pairexx/chat-service/internal/delivery/ws"
	"github.com/QosmuratSamat0/pairexx/chat-service/internal/domain"
	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"
)

type ChatHandler struct {
	hub            *ws.Hub
	repo           domain.ChatRepository
	moderation     domain.ModerationClient
	internalToken  string
	appEnv         string
	allowedOrigins []string
}

func NewChatHandler(r chi.Router, hub *ws.Hub, repo domain.ChatRepository, moderation domain.ModerationClient, internalToken string, appEnv string, allowedOrigins []string) {
	h := &ChatHandler{
		hub:            hub,
		repo:           repo,
		moderation:     moderation,
		internalToken:  internalToken,
		appEnv:         appEnv,
		allowedOrigins: allowedOrigins,
	}

	r.Route("/chat", func(r chi.Router) {
		r.HandleFunc("/ws", h.ServeWS)
		r.Get("/rooms/{id}/messages", h.GetMessages)
		r.Post("/internal/rooms", h.CreateRoom)
		r.Post("/internal/disconnect", h.DisconnectUser)
	})

	r.HandleFunc("/ws", h.ServeWS) // Fallback for direct gateway /ws mapping
	r.HandleFunc("/dashboard/chats/ws", h.ServeWS)
	r.Get("/health", h.Health)
}

func (h *ChatHandler) ServeWS(w http.ResponseWriter, r *http.Request) {
	roomID := r.URL.Query().Get("room_id")
	userID := r.Header.Get("X-User-ID")
	_, ok := h.authorizeRoomRequest(w, r, roomID, userID)
	if !ok {
		return
	}

	upgrader := websocket.Upgrader{
		ReadBufferSize:  4096,
		WriteBufferSize: 4096,
		CheckOrigin: func(r *http.Request) bool {
			// Keep dev friction low, but lock down prod.
			if strings.EqualFold(h.appEnv, "development") {
				return true
			}
			return isOriginAllowed(r.Header.Get("Origin"), h.allowedOrigins)
		},
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}

	client := ws.NewClient(h.hub, conn, userID, roomID, h.repo, h.moderation)
	h.hub.Register(client)

	go client.WritePump()
	go client.ReadPump()
}

func (h *ChatHandler) GetMessages(w http.ResponseWriter, r *http.Request) {
	roomID := chi.URLParam(r, "id")
	userID := r.Header.Get("X-User-ID")

	if _, ok := h.authorizeRoomRequest(w, r, roomID, userID); !ok {
		return
	}

	messages, err := h.repo.GetMessages(r.Context(), roomID)
	if err != nil {
		RespondWithError(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	type messageResponse struct {
		ID        string `json:"id"`
		Content   string `json:"content"`
		Sender    string `json:"sender"`
		Timestamp int64  `json:"timestamp"`
	}

	payload := make([]messageResponse, 0, len(messages))
	for _, msg := range messages {
		sender := "partner"
		if msg.SenderID == userID {
			sender = "me"
		}

		payload = append(payload, messageResponse{
			ID:        msg.ID,
			Content:   msg.Content,
			Sender:    sender,
			Timestamp: msg.SentAt.Unix(),
		})
	}

	RespondWithJSON(w, http.StatusOK, payload)
}

func (h *ChatHandler) CreateRoom(w http.ResponseWriter, r *http.Request) {
	if !h.isInternalAuthorized(r) {
		RespondWithError(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "internal token missing or invalid")
		return
	}
	var req domain.Room
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		RespondWithError(w, r, http.StatusBadRequest, "BAD_REQUEST", "invalid json body")
		return
	}
	req.Status = "active"
	if err := h.repo.CreateRoom(r.Context(), &req); err != nil {
		RespondWithError(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}
	w.WriteHeader(http.StatusCreated)
}

func (h *ChatHandler) DisconnectUser(w http.ResponseWriter, r *http.Request) {
	if !h.isInternalAuthorized(r) {
		RespondWithError(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "internal token missing or invalid")
		return
	}
	var req struct {
		UserID string `json:"user_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		RespondWithError(w, r, http.StatusBadRequest, "BAD_REQUEST", "invalid json body")
		return
	}
	h.hub.DisconnectUser(req.UserID)
	w.WriteHeader(http.StatusOK)
}

func (h *ChatHandler) Health(w http.ResponseWriter, r *http.Request) {
	if err := h.repo.HealthCheck(r.Context()); err != nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		w.Write([]byte("ERROR: " + err.Error()))
		return
	}
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("OK"))
}

func (h *ChatHandler) isInternalAuthorized(r *http.Request) bool {
	if h.internalToken == "" {
		return false
	}
	return r.Header.Get("X-Internal-Token") == h.internalToken
}

func (h *ChatHandler) authorizeRoomRequest(w http.ResponseWriter, r *http.Request, roomID, userID string) (*domain.Room, bool) {
	if userID == "" {
		RespondWithError(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "user id missing")
		return nil, false
	}
	if roomID == "" {
		RespondWithError(w, r, http.StatusBadRequest, "BAD_REQUEST", "room_id is required")
		return nil, false
	}

	room, err := h.repo.GetRoom(r.Context(), roomID)
	if err != nil || room == nil {
		RespondWithError(w, r, http.StatusNotFound, "NOT_FOUND", "room not found")
		return nil, false
	}
	if userID != room.UserA && userID != room.UserB {
		RespondWithError(w, r, http.StatusForbidden, "FORBIDDEN", "access denied to this room")
		return nil, false
	}

	return room, true
}
