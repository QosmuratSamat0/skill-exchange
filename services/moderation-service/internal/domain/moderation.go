package domain

import (
	"context"
	"time"
)

type Report struct {
	ID             string    `json:"id"`
	RoomID         string    `json:"room_id"`
	ReporterUserID string    `json:"reporter_user_id"`
	ReportedUserID string    `json:"reported_user_id"`
	Reason         string    `json:"reason"`
	CreatedAt      time.Time `json:"created_at"`
}

type ReportCounts struct {
	Last24h int `json:"last_24h"`
	Last7d  int `json:"last_7d"`
	Total   int `json:"total"`
}

type ReportRepository interface {
	CreateReport(ctx context.Context, r *Report) error
	GetReport(ctx context.Context, id string) (*Report, error)
	ListReports(ctx context.Context, limit int) ([]*Report, error)
	CountReports(ctx context.Context, reportedUserID string, now time.Time) (ReportCounts, error)
}

type UserClient interface {
	Ban(ctx context.Context, userID string, reason string, bannedBy string, hours int) error
}

type ChatClient interface {
	Disconnect(ctx context.Context, userID string) error
}

type NotificationClient interface {
	Notify(ctx context.Context, typ string, userID string, payload map[string]any) error
}

type ModerationUsecase interface {
	CreateReport(ctx context.Context, reporterUserID, reportedUserID, roomID, reason string) (*Report, *ReportCounts, error)
	GetReport(ctx context.Context, id string) (*Report, error)
	ListReports(ctx context.Context, limit int) ([]*Report, error)
	ModerateMessage(ctx context.Context, content string) (bool, error)
}
