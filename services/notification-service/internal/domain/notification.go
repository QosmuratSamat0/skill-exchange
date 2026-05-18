package domain

import (
	"context"
	"time"
)

type Notification struct {
	Type    string         `json:"type"`
	UserID  string         `json:"user_id"`
	Payload map[string]any `json:"payload,omitempty"`
}

type InAppNotification struct {
	ID        string         `json:"id"`
	UserID    string         `json:"user_id"`
	Type      string         `json:"type"`
	Title     string         `json:"title"`
	Body      string         `json:"body"`
	Payload   map[string]any `json:"payload,omitempty"`
	ReadAt    *time.Time     `json:"read_at,omitempty"`
	CreatedAt time.Time      `json:"created_at"`
}

type Channel interface {
	Send(ctx context.Context, n Notification) error
}

type Repository interface {
	Save(ctx context.Context, n *InAppNotification) error
	ListForUser(ctx context.Context, userID string, limit int) ([]*InAppNotification, error)
	Close()
}

type Usecase interface {
	Notify(ctx context.Context, n Notification) error
	ListForUser(ctx context.Context, userID string, limit int) ([]*InAppNotification, error)
}
