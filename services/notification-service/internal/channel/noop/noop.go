package noop

import (
	"context"

	"github.com/QosmuratSamat0/pairexx/notification-service/internal/domain"
)

type Channel struct{}

func New() *Channel { return &Channel{} }

func (c *Channel) Send(ctx context.Context, n domain.Notification) error {
	return nil
}

