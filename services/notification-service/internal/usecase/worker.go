package usecase

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/QosmuratSamat0/pairexx/notification-service/internal/domain"
	"github.com/QosmuratSamat0/pairexx/pkg/mq"
	"github.com/rs/zerolog/log"
	"time"
)

type NotificationWorker struct {
	mq *mq.JetStream
	uc domain.Usecase
}

func NewNotificationWorker(mq *mq.JetStream, uc domain.Usecase) *NotificationWorker {
	return &NotificationWorker{mq: mq, uc: uc}
}

type matchFoundEvent struct {
	ID        string    `json:"id"`
	UserA     string    `json:"user_a"`
	UserB     string    `json:"user_b"`
	Mode      string    `json:"mode"`
	CreatedAt time.Time `json:"created_at"`
}

type exchangeCompletedEvent struct {
	RequestID   string    `json:"request_id"`
	FromUserID  string    `json:"from_user_id"`
	ToUserID    string    `json:"to_user_id"`
	CompletedAt time.Time `json:"completed_at"`
}

type exchangeCompletionTriggeredEvent struct {
	RequestID     string    `json:"request_id"`
	FromUserID    string    `json:"from_user_id"`
	ToUserID      string    `json:"to_user_id"`
	TriggeredByID string    `json:"triggered_by_id"`
	RecipientID   string    `json:"recipient_id"`
	TriggeredAt   time.Time `json:"triggered_at"`
}

func (w *NotificationWorker) Start(ctx context.Context) error {
	log.Info().Msg("Starting Notification Worker (NATS Subscriber)")

	if err := w.mq.Subscribe(ctx, "EVENTS", "match.found", "notification-service-matcher", func(data []byte) error {
		var event struct {
			ID    string `json:"id"`
			UserA string `json:"user_a"`
			UserB string `json:"user_b"`
			Mode  string `json:"mode"`
		}

		if err := json.Unmarshal(data, &event); err != nil {
			log.Error().Err(err).Msg("failed to unmarshal match.found event")
			return nil // Return nil to avoid retry on bad JSON
		}

		log.Info().
			Str("room_id", event.ID).
			Str("user_a", event.UserA).
			Str("user_b", event.UserB).
			Msg("Processing match.found notification")

		// 1. Send push/email/etc. (Simulated)
		w.sendNotification(event.UserA, "Match found! Room: "+event.ID)
		w.sendNotification(event.UserB, "Match found! Room: "+event.ID)

		return nil
	}); err != nil {
		return err
	}

	if err := w.mq.Subscribe(ctx, "EVENTS", "exchange.completion_triggered", "notification-service-exchange-completion-triggered", func(data []byte) error {
		var event exchangeCompletionTriggeredEvent
		if err := json.Unmarshal(data, &event); err != nil {
			log.Error().Err(err).Msg("failed to unmarshal exchange.completion_triggered event")
			return nil
		}
		if event.RecipientID == "" {
			if event.TriggeredByID == event.FromUserID {
				event.RecipientID = event.ToUserID
			} else {
				event.RecipientID = event.FromUserID
			}
		}

		log.Info().
			Str("request_id", event.RequestID).
			Str("triggered_by_id", event.TriggeredByID).
			Str("recipient_id", event.RecipientID).
			Msg("Processing exchange.completion_triggered notification")

		n := domain.Notification{
			Type:   "exchange_completion_triggered",
			UserID: event.RecipientID,
			Payload: map[string]any{
				"request_id":      event.RequestID,
				"partner_user_id": event.TriggeredByID,
				"triggered_at":    event.TriggeredAt.Format(time.RFC3339),
			},
		}
		if w.uc == nil {
			return fmt.Errorf("notification usecase is not initialized")
		}
		if err := w.uc.Notify(ctx, n); err != nil {
			return fmt.Errorf("send exchange completion prompt to %s: %w", event.RecipientID, err)
		}
		return nil
	}); err != nil {
		return err
	}

	if err := w.mq.Subscribe(ctx, "EVENTS", "exchange.completed", "notification-service-exchange-completed", func(data []byte) error {
		var event exchangeCompletedEvent
		if err := json.Unmarshal(data, &event); err != nil {
			log.Error().Err(err).Msg("failed to unmarshal exchange.completed event")
			return nil
		}

		log.Info().
			Str("request_id", event.RequestID).
			Str("from_user_id", event.FromUserID).
			Str("to_user_id", event.ToUserID).
			Msg("Processing exchange.completed notification")

		for _, recipientID := range []string{event.FromUserID, event.ToUserID} {
			if recipientID == "" {
				continue
			}
			partnerID := event.FromUserID
			if recipientID == event.FromUserID {
				partnerID = event.ToUserID
			}

			n := domain.Notification{
				Type:   "exchange_completed",
				UserID: recipientID,
				Payload: map[string]any{
					"request_id":      event.RequestID,
					"partner_user_id": partnerID,
					"completed_at":    event.CompletedAt.Format(time.RFC3339),
				},
			}
			if w.uc == nil {
				return fmt.Errorf("notification usecase is not initialized")
			}
			if err := w.uc.Notify(ctx, n); err != nil {
				return fmt.Errorf("send exchange completion email to %s: %w", recipientID, err)
			}
		}

		return nil
	}); err != nil {
		return err
	}

	return nil
}

func (w *NotificationWorker) sendNotification(userID, message string) {
	// Real implementation would call a push service or email service
	log.Debug().Str("user_id", userID).Str("msg", message).Msg("Notification SENT")
}
