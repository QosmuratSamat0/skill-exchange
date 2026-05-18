package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/QosmuratSamat0/pairexx/moderation-service/internal/domain"
)

type PGReportRepository struct {
	pool *pgxpool.Pool
}

func NewPGReportRepository(pool *pgxpool.Pool) *PGReportRepository {
	return &PGReportRepository{pool: pool}
}

func (r *PGReportRepository) CreateReport(ctx context.Context, rep *domain.Report) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO reports (id, room_id, reporter_user_id, reported_user_id, reason, created_at)
		VALUES ($1,$2,$3,$4,$5,$6)
		ON CONFLICT (reporter_user_id, reported_user_id) DO NOTHING
	`, rep.ID, rep.RoomID, rep.ReporterUserID, rep.ReportedUserID, rep.Reason, rep.CreatedAt)
	return err
}

func (r *PGReportRepository) GetReport(ctx context.Context, id string) (*domain.Report, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT id, room_id, reporter_user_id, reported_user_id, reason, created_at
		FROM reports
		WHERE id=$1
	`, id)

	var rep domain.Report
	if err := row.Scan(&rep.ID, &rep.RoomID, &rep.ReporterUserID, &rep.ReportedUserID, &rep.Reason, &rep.CreatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errors.New("report not found")
		}
		return nil, err
	}
	return &rep, nil
}

func (r *PGReportRepository) ListReports(ctx context.Context, limit int) ([]*domain.Report, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, room_id, reporter_user_id, reported_user_id, reason, created_at
		FROM reports
		ORDER BY created_at DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*domain.Report
	for rows.Next() {
		var rep domain.Report
		if err := rows.Scan(&rep.ID, &rep.RoomID, &rep.ReporterUserID, &rep.ReportedUserID, &rep.Reason, &rep.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, &rep)
	}
	if rows.Err() != nil {
		return nil, rows.Err()
	}
	return out, nil
}

func (r *PGReportRepository) CountReports(ctx context.Context, reportedUserID string, now time.Time) (domain.ReportCounts, error) {
	var c domain.ReportCounts

	if err := r.pool.QueryRow(ctx, `SELECT COUNT(1) FROM reports WHERE reported_user_id=$1`, reportedUserID).Scan(&c.Total); err != nil {
		return domain.ReportCounts{}, err
	}

	if err := r.pool.QueryRow(ctx, `
		SELECT COUNT(1) FROM reports
		WHERE reported_user_id=$1 AND created_at >= $2
	`, reportedUserID, now.Add(-24*time.Hour)).Scan(&c.Last24h); err != nil {
		return domain.ReportCounts{}, err
	}

	if err := r.pool.QueryRow(ctx, `
		SELECT COUNT(1) FROM reports
		WHERE reported_user_id=$1 AND created_at >= $2
	`, reportedUserID, now.Add(-7*24*time.Hour)).Scan(&c.Last7d); err != nil {
		return domain.ReportCounts{}, err
	}

	return c, nil
}

