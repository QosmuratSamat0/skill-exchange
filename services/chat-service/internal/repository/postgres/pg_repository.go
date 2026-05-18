package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/QosmuratSamat0/pairexx/chat-service/internal/domain"
)

type PGChatRepository struct {
	pool *pgxpool.Pool
}

func NewPGChatRepository(pool *pgxpool.Pool) *PGChatRepository {
	return &PGChatRepository{pool: pool}
}

func (r *PGChatRepository) CreateRoom(ctx context.Context, room *domain.Room) error {
	if room.CreatedAt.IsZero() {
		room.CreatedAt = time.Now()
	}
	if room.Status == "" {
		room.Status = "active"
	}

	_, err := r.pool.Exec(ctx, `
		INSERT INTO rooms (id, user_a, user_b, status, created_at, ended_at)
		VALUES ($1,$2,$3,$4,$5,$6)
	`, room.ID, room.UserA, room.UserB, room.Status, room.CreatedAt, room.EndedAt)
	return err
}

func (r *PGChatRepository) GetRoom(ctx context.Context, id string) (*domain.Room, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT id, user_a, user_b, status, created_at, ended_at
		FROM rooms
		WHERE id=$1
	`, id)

	var room domain.Room
	if err := row.Scan(&room.ID, &room.UserA, &room.UserB, &room.Status, &room.CreatedAt, &room.EndedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errors.New("room not found")
		}
		return nil, err
	}
	return &room, nil
}

func (r *PGChatRepository) UpdateRoom(ctx context.Context, room *domain.Room) error {
	ct, err := r.pool.Exec(ctx, `
		UPDATE rooms
		SET user_a=$2, user_b=$3, status=$4, created_at=$5, ended_at=$6
		WHERE id=$1
	`, room.ID, room.UserA, room.UserB, room.Status, room.CreatedAt, room.EndedAt)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return errors.New("room not found")
	}
	return nil
}

func (r *PGChatRepository) SaveMessage(ctx context.Context, msg *domain.Message) error {
	if msg.ID == "" {
		msg.ID = uuid.NewString()
	}
	if msg.SentAt.IsZero() {
		msg.SentAt = time.Now()
	}
	_, err := r.pool.Exec(ctx, `
		INSERT INTO messages (id, room_id, sender_id, content, sent_at)
		VALUES ($1,$2,$3,$4,$5)
	`, msg.ID, msg.RoomID, msg.SenderID, msg.Content, msg.SentAt)
	return err
}

func (r *PGChatRepository) GetMessages(ctx context.Context, roomID string) ([]*domain.Message, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, room_id, sender_id, content, sent_at
		FROM messages
		WHERE room_id=$1
		ORDER BY sent_at ASC
	`, roomID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*domain.Message
	for rows.Next() {
		var m domain.Message
		if err := rows.Scan(&m.ID, &m.RoomID, &m.SenderID, &m.Content, &m.SentAt); err != nil {
			return nil, err
		}
		out = append(out, &m)
	}
	if rows.Err() != nil {
		return nil, rows.Err()
	}
	return out, nil
}


func (r *PGChatRepository) HealthCheck(ctx context.Context) error {
	return r.pool.Ping(ctx)
}
