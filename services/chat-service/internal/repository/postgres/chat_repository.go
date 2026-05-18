package postgres

import (
	"context"
	"errors"
	"sync"
	"github.com/QosmuratSamat0/pairexx/chat-service/internal/domain"
)

type InMemoryChatRepository struct {
	mu       sync.RWMutex
	rooms    map[string]*domain.Room
	messages map[string][]*domain.Message
}

func NewInMemoryChatRepository() *InMemoryChatRepository {
	return &InMemoryChatRepository{
		rooms:    make(map[string]*domain.Room),
		messages: make(map[string][]*domain.Message),
	}
}

func (r *InMemoryChatRepository) CreateRoom(ctx context.Context, room *domain.Room) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.rooms[room.ID] = room
	return nil
}

func (r *InMemoryChatRepository) GetRoom(ctx context.Context, id string) (*domain.Room, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	room, ok := r.rooms[id]
	if !ok {
		return nil, errors.New("room not found")
	}
	return room, nil
}

func (r *InMemoryChatRepository) UpdateRoom(ctx context.Context, room *domain.Room) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.rooms[room.ID] = room
	return nil
}

func (r *InMemoryChatRepository) SaveMessage(ctx context.Context, msg *domain.Message) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.messages[msg.RoomID] = append(r.messages[msg.RoomID], msg)
	return nil
}

func (r *InMemoryChatRepository) GetMessages(ctx context.Context, roomID string) ([]*domain.Message, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.messages[roomID], nil
}

func (r *InMemoryChatRepository) HealthCheck(ctx context.Context) error {
	return nil
}
