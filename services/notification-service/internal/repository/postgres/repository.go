package postgres

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"time"

	"github.com/QosmuratSamat0/pairexx/notification-service/internal/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	pool *pgxpool.Pool
}

func New(ctx context.Context, dsn string) (*Repository, error) {
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return &Repository{pool: pool}, nil
}

func (r *Repository) Save(ctx context.Context, n *domain.InAppNotification) error {
	if n == nil {
		return nil
	}
	if n.ID == "" {
		n.ID = newID()
	}
	if n.CreatedAt.IsZero() {
		n.CreatedAt = time.Now()
	}
	payload := []byte(`{}`)
	if n.Payload != nil {
		b, err := json.Marshal(n.Payload)
		if err != nil {
			return err
		}
		payload = b
	}

	_, err := r.pool.Exec(ctx, `
		INSERT INTO notifications (id, user_id, type, title, body, payload, read_at, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (id) DO NOTHING
	`, n.ID, n.UserID, n.Type, n.Title, n.Body, payload, n.ReadAt, n.CreatedAt)
	return err
}

func (r *Repository) ListForUser(ctx context.Context, userID string, limit int) ([]*domain.InAppNotification, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	rows, err := r.pool.Query(ctx, `
		SELECT id, user_id, type, title, body, payload, read_at, created_at
		FROM notifications
		WHERE user_id = $1
		ORDER BY created_at DESC
		LIMIT $2
	`, userID, limit)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return []*domain.InAppNotification{}, nil
		}
		return nil, err
	}
	defer rows.Close()

	var out []*domain.InAppNotification
	for rows.Next() {
		var n domain.InAppNotification
		var payload []byte
		if err := rows.Scan(&n.ID, &n.UserID, &n.Type, &n.Title, &n.Body, &payload, &n.ReadAt, &n.CreatedAt); err != nil {
			return nil, err
		}
		if len(payload) > 0 {
			_ = json.Unmarshal(payload, &n.Payload)
		}
		if n.Payload == nil {
			n.Payload = map[string]any{}
		}
		out = append(out, &n)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if out == nil {
		return []*domain.InAppNotification{}, nil
	}
	return out, nil
}

func (r *Repository) Close() {
	if r != nil && r.pool != nil {
		r.pool.Close()
	}
}

func newID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return hex.EncodeToString([]byte(time.Now().Format(time.RFC3339Nano)))
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return hex.EncodeToString(b[:])
}
