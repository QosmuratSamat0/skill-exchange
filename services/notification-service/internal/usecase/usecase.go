package usecase

import (
	"context"
	"errors"

	"github.com/QosmuratSamat0/pairexx/notification-service/internal/domain"
)

type usecase struct {
	repo     domain.Repository
	channels []domain.Channel
}

func New(channels ...domain.Channel) domain.Usecase {
	return &usecase{channels: channels}
}

func NewWithRepository(repo domain.Repository, channels ...domain.Channel) domain.Usecase {
	return &usecase{repo: repo, channels: channels}
}

func (u *usecase) Notify(ctx context.Context, n domain.Notification) error {
	if u.repo != nil {
		if inApp := buildInAppNotification(n); inApp != nil {
			if err := u.repo.Save(ctx, inApp); err != nil {
				return err
			}
		}
	}

	// Best-effort fanout; stop on first error for now (simple MVP).
	for _, ch := range u.channels {
		if ch == nil {
			continue
		}
		if err := ch.Send(ctx, n); err != nil {
			return err
		}
	}
	return nil
}

func (u *usecase) ListForUser(ctx context.Context, userID string, limit int) ([]*domain.InAppNotification, error) {
	if userID == "" {
		return nil, errors.New("user_id is required")
	}
	if u.repo == nil {
		return []*domain.InAppNotification{}, nil
	}
	return u.repo.ListForUser(ctx, userID, limit)
}

func buildInAppNotification(n domain.Notification) *domain.InAppNotification {
	switch n.Type {
	case "exchange_completion_triggered":
		return &domain.InAppNotification{
			UserID:  n.UserID,
			Type:    n.Type,
			Title:   "Партнер предлагает завершить обмен",
			Body:    "Ваш партнер предлагает завершить обмен навыками. Зайдите в чат и подтвердите завершение.",
			Payload: n.Payload,
		}
	case "exchange_completed":
		return &domain.InAppNotification{
			UserID:  n.UserID,
			Type:    n.Type,
			Title:   "Обмен успешно завершен",
			Body:    "Оба участника подтвердили завершение обмена навыками.",
			Payload: n.Payload,
		}
	default:
		return nil
	}
}
