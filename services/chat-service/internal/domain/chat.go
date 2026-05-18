package domain

import (
	"context"
	"time"
)

type Room struct {
	ID        string    `json:"id"`
	UserA     string    `json:"user_a"`
	UserB     string    `json:"user_b"`
	Status    string    `json:"status"` // active/ended
	CreatedAt time.Time `json:"created_at"`
	EndedAt   *time.Time `json:"ended_at,omitempty"`
}

type Message struct {
	ID        string    `json:"id"`
	RoomID    string    `json:"room_id"`
	SenderID  string    `json:"sender_id"`
	Content   string    `json:"content"`
	SentAt    time.Time `json:"sent_at"`
}

type ChatRepository interface {
	CreateRoom(ctx context.Context, room *Room) error
	GetRoom(ctx context.Context, id string) (*Room, error)
	UpdateRoom(ctx context.Context, room *Room) error
	
	SaveMessage(ctx context.Context, msg *Message) error
	GetMessages(ctx context.Context, roomID string) ([]*Message, error)
	HealthCheck(ctx context.Context) error
}

type ModerationClient interface {
	IsToxic(ctx context.Context, content string) (bool, error)
}
