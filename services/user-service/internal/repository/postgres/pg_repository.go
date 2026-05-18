package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/QosmuratSamat0/pairexx/user-service/internal/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/lib/pq"
)

type PGUserRepository struct {
	pool *pgxpool.Pool
}

func NewPGUserRepository(pool *pgxpool.Pool) *PGUserRepository {
	return &PGUserRepository{pool: pool}
}

// ---------------------------------------------------------------------------
// Core user CRUD
// ---------------------------------------------------------------------------

func (r *PGUserRepository) Create(ctx context.Context, user *domain.User) error {
	if user.Interests == nil {
		user.Interests = []string{}
	}
	_, err := r.pool.Exec(ctx, `
		INSERT INTO users (id, device_id, email, password_hash, gender, interests, is_anonymous, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
	`, user.ID, nullIfEmpty(user.DeviceID), nullIfEmpty(user.Email), nullIfEmpty(user.PasswordHash),
		user.Gender, user.Interests, user.IsAnonymous, user.CreatedAt)
	if err == nil {
		return nil
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return domain.ErrUserAlreadyExists
	}
	var pqErr *pq.Error
	if errors.As(err, &pqErr) && pqErr.Code == "23505" {
		return domain.ErrUserAlreadyExists
	}
	return err
}

func (r *PGUserRepository) GetByID(ctx context.Context, id string) (*domain.User, error) {
	return r.getOne(ctx, `SELECT id, device_id, email, password_hash, gender, interests, is_anonymous, created_at FROM users WHERE id=$1`, id)
}

func (r *PGUserRepository) GetByDeviceID(ctx context.Context, deviceID string) (*domain.User, error) {
	return r.getOne(ctx, `SELECT id, device_id, email, password_hash, gender, interests, is_anonymous, created_at FROM users WHERE device_id=$1`, deviceID)
}

func (r *PGUserRepository) GetByEmail(ctx context.Context, email string) (*domain.User, error) {
	return r.getOne(ctx, `SELECT id, device_id, email, password_hash, gender, interests, is_anonymous, created_at FROM users WHERE email=$1`, email)
}

func (r *PGUserRepository) Update(ctx context.Context, user *domain.User) error {
	if user.Interests == nil {
		user.Interests = []string{}
	}
	ct, err := r.pool.Exec(ctx, `
		UPDATE users
		SET device_id=$2, email=$3, password_hash=$4, gender=$5, interests=$6, is_anonymous=$7
		WHERE id=$1
	`, user.ID, nullIfEmpty(user.DeviceID), nullIfEmpty(user.Email), nullIfEmpty(user.PasswordHash),
		user.Gender, user.Interests, user.IsAnonymous)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return errors.New("user not found")
	}
	return nil
}

func (r *PGUserRepository) Delete(ctx context.Context, id string) error {
	ct, err := r.pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, id)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return errors.New("user not found")
	}
	return nil
}

func (r *PGUserRepository) ListAll(ctx context.Context, limit, offset int) ([]*domain.User, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, device_id, email, password_hash, gender, interests, is_anonymous, created_at
		FROM users
		ORDER BY created_at DESC
		LIMIT $1 OFFSET $2
	`, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return r.scanUsers(rows)
}

func (r *PGUserRepository) CountAll(ctx context.Context) (int, error) {
	var count int
	err := r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM users`).Scan(&count)
	return count, err
}

// ---------------------------------------------------------------------------
// Bans
// ---------------------------------------------------------------------------

func (r *PGUserRepository) CreateBan(ctx context.Context, ban *domain.Ban) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO bans (id, user_id, reason, banned_by, expires_at, created_at)
		VALUES ($1,$2,$3,$4,$5,$6)
	`, ban.ID, ban.UserID, ban.Reason, ban.BannedBy, ban.ExpiresAt, ban.CreatedAt)
	return err
}

func (r *PGUserRepository) GetActiveBan(ctx context.Context, userID string) (*domain.Ban, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT id, user_id, reason, banned_by, expires_at, created_at
		FROM bans
		WHERE user_id=$1 AND expires_at > $2
		ORDER BY expires_at DESC
		LIMIT 1
	`, userID, time.Now())

	var b domain.Ban
	if err := row.Scan(&b.ID, &b.UserID, &b.Reason, &b.BannedBy, &b.ExpiresAt, &b.CreatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &b, nil
}

func (r *PGUserRepository) ListBans(ctx context.Context, userID string) ([]*domain.Ban, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, user_id, reason, banned_by, expires_at, created_at
		FROM bans
		WHERE user_id=$1
		ORDER BY created_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var bans []*domain.Ban
	for rows.Next() {
		var b domain.Ban
		if err := rows.Scan(&b.ID, &b.UserID, &b.Reason, &b.BannedBy, &b.ExpiresAt, &b.CreatedAt); err != nil {
			return nil, err
		}
		bans = append(bans, &b)
	}
	return bans, rows.Err()
}

func (r *PGUserRepository) UnbanUser(ctx context.Context, userID string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE bans SET expires_at=$2 WHERE user_id=$1 AND expires_at > $2
	`, userID, time.Now())
	return err
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

func (r *PGUserRepository) UpsertProfile(ctx context.Context, profile *domain.UserProfile) error {
	if profile.TeachSkills == nil {
		profile.TeachSkills = []string{}
	}
	if profile.LearnSkills == nil {
		profile.LearnSkills = []string{}
	}
	// pgx/v5 encodes []string natively as a PostgreSQL text[] — do NOT wrap with
	// pq.Array() here. pq.Array uses lib/pq's text-protocol encoding which is
	// incompatible with pgx's binary wire protocol and causes 500 errors on read.
	_, err := r.pool.Exec(ctx, `
		INSERT INTO user_profiles
			(user_id, name, avatar, bio, contact_number, teach_skills, learn_skills, rating, review_count, email_notifications_enabled, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
		ON CONFLICT (user_id) DO UPDATE SET
			name           = EXCLUDED.name,
			avatar         = EXCLUDED.avatar,
			bio            = EXCLUDED.bio,
			contact_number = EXCLUDED.contact_number,
			teach_skills   = EXCLUDED.teach_skills,
			learn_skills   = EXCLUDED.learn_skills,
			rating         = EXCLUDED.rating,
			review_count   = EXCLUDED.review_count,
			email_notifications_enabled = EXCLUDED.email_notifications_enabled,
			updated_at     = EXCLUDED.updated_at
	`, profile.UserID, profile.Name, profile.Avatar, profile.Bio, profile.ContactNumber,
		profile.TeachSkills, profile.LearnSkills,
		profile.Rating, profile.ReviewCount, profile.EmailNotificationsEnabled, profile.UpdatedAt)
	return err
}

func (r *PGUserRepository) GetProfile(ctx context.Context, userID string) (*domain.UserProfile, error) {
	var p domain.UserProfile
	// pgx/v5 scans PostgreSQL text[] directly into []string — no pq.Array() needed.
	// Using pq.Array() here caused a 500: pgx sends binary-format data which
	// lib/pq's scanner expects as text starting with '{', producing:
	// "pq: unable to parse array; expected '{' at offset 0"
	err := r.pool.QueryRow(ctx, `
		SELECT user_id, name, avatar, bio, contact_number, teach_skills, learn_skills, rating, review_count,
		       email_notifications_enabled, updated_at
		FROM user_profiles WHERE user_id=$1
	`, userID).Scan(
		&p.UserID, &p.Name, &p.Avatar, &p.Bio, &p.ContactNumber,
		&p.TeachSkills, &p.LearnSkills, &p.Rating, &p.ReviewCount,
		&p.EmailNotificationsEnabled, &p.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// No profile row yet — return a synthetic default that mirrors the
			// DB column default (email_notifications_enabled DEFAULT true).
			// Without this, Go's zero-value false would cause the SMTP channel
			// to silently skip every new user who hasn't saved a profile yet.
			return &domain.UserProfile{
				UserID:                    userID,
				TeachSkills:               []string{},
				LearnSkills:               []string{},
				EmailNotificationsEnabled: true,
			}, nil
		}
		return nil, err
	}
	if p.TeachSkills == nil {
		p.TeachSkills = []string{}
	}
	if p.LearnSkills == nil {
		p.LearnSkills = []string{}
	}
	return &p, nil
}

func (r *PGUserRepository) UpdateEmailPreference(ctx context.Context, userID string, enabled bool) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO user_profiles (user_id, email_notifications_enabled, teach_skills, learn_skills, updated_at)
		VALUES ($1, $2, '{}', '{}', NOW())
		ON CONFLICT (user_id) DO UPDATE SET
			email_notifications_enabled = EXCLUDED.email_notifications_enabled,
			updated_at = NOW()
	`, userID, enabled)
	return err
}

// GetEmailPreference reads ONLY the email_notifications_enabled column from
// user_profiles directly from Postgres, bypassing any Redis cache layer.
// Returns true when no row exists (mirrors the column's DEFAULT true) so that
// new or incomplete profiles never suppress email delivery.
func (r *PGUserRepository) GetEmailPreference(ctx context.Context, userID string) (bool, error) {
	var enabled bool
	err := r.pool.QueryRow(ctx, `
		SELECT email_notifications_enabled
		FROM user_profiles WHERE user_id = $1
	`, userID).Scan(&enabled)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return true, nil // no profile row — default ON (mirrors DB DEFAULT true)
		}
		return true, nil // any DB error — safe default is ON
	}
	return enabled, nil
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

func (r *PGUserRepository) CreateReview(ctx context.Context, review *domain.Review) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO reviews (id, from_user_id, to_user_id, rating, comment, created_at)
		VALUES ($1,$2,$3,$4,$5,$6)
		ON CONFLICT (from_user_id, to_user_id) DO UPDATE SET
			rating     = EXCLUDED.rating,
			comment    = EXCLUDED.comment,
			created_at = EXCLUDED.created_at
	`, review.ID, review.FromUserID, review.ToUserID, review.Rating, review.Comment, review.CreatedAt)
	return err
}

func (r *PGUserRepository) ListReviewsForUser(ctx context.Context, userID string, limit, offset int) ([]*domain.Review, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, from_user_id, to_user_id, rating, comment, created_at
		FROM reviews
		WHERE to_user_id=$1
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3
	`, userID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var reviews []*domain.Review
	for rows.Next() {
		var rv domain.Review
		if err := rows.Scan(&rv.ID, &rv.FromUserID, &rv.ToUserID, &rv.Rating, &rv.Comment, &rv.CreatedAt); err != nil {
			return nil, err
		}
		reviews = append(reviews, &rv)
	}
	return reviews, rows.Err()
}

func (r *PGUserRepository) GetAverageRating(ctx context.Context, userID string) (float64, int, error) {
	var avg float64
	var count int
	err := r.pool.QueryRow(ctx, `
		SELECT COALESCE(AVG(rating), 0), COUNT(*)
		FROM reviews WHERE to_user_id=$1
	`, userID).Scan(&avg, &count)
	return avg, count, err
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

func (r *PGUserRepository) CreateSession(ctx context.Context, session *domain.UserSession) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO user_sessions (id, user_id, refresh_token, user_agent, ip, created_at, expires_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7)
	`, session.ID, session.UserID, session.RefreshToken, session.UserAgent,
		session.IP, session.CreatedAt, session.ExpiresAt)
	return err
}

func (r *PGUserRepository) GetSessionByToken(ctx context.Context, refreshToken string) (*domain.UserSession, error) {
	var s domain.UserSession
	err := r.pool.QueryRow(ctx, `
		SELECT id, user_id, refresh_token, user_agent, ip, created_at, expires_at
		FROM user_sessions WHERE refresh_token=$1
	`, refreshToken).Scan(
		&s.ID, &s.UserID, &s.RefreshToken, &s.UserAgent, &s.IP, &s.CreatedAt, &s.ExpiresAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errors.New("session not found")
		}
		return nil, err
	}
	return &s, nil
}

func (r *PGUserRepository) DeleteSession(ctx context.Context, sessionID string) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM user_sessions WHERE id=$1`, sessionID)
	return err
}

func (r *PGUserRepository) DeleteAllUserSessions(ctx context.Context, userID string) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM user_sessions WHERE user_id=$1`, userID)
	return err
}

func (r *PGUserRepository) ListUserSessions(ctx context.Context, userID string) ([]*domain.UserSession, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, user_id, refresh_token, user_agent, ip, created_at, expires_at
		FROM user_sessions
		WHERE user_id=$1
		ORDER BY created_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sessions []*domain.UserSession
	for rows.Next() {
		var s domain.UserSession
		if err := rows.Scan(&s.ID, &s.UserID, &s.RefreshToken, &s.UserAgent, &s.IP, &s.CreatedAt, &s.ExpiresAt); err != nil {
			return nil, err
		}
		sessions = append(sessions, &s)
	}
	return sessions, rows.Err()
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func (r *PGUserRepository) getOne(ctx context.Context, q string, arg any) (*domain.User, error) {
	row := r.pool.QueryRow(ctx, q, arg)

	var u domain.User
	var deviceID, email, passwordHash *string

	if err := row.Scan(&u.ID, &deviceID, &email, &passwordHash, &u.Gender, &u.Interests, &u.IsAnonymous, &u.CreatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errors.New("user not found")
		}
		return nil, err
	}

	if deviceID != nil {
		u.DeviceID = *deviceID
	}
	if email != nil {
		u.Email = *email
	}
	if passwordHash != nil {
		u.PasswordHash = *passwordHash
	}

	return &u, nil
}

func (r *PGUserRepository) scanUsers(rows pgx.Rows) ([]*domain.User, error) {
	var users []*domain.User
	for rows.Next() {
		var u domain.User
		var deviceID, email, passwordHash *string
		if err := rows.Scan(&u.ID, &deviceID, &email, &passwordHash, &u.Gender, &u.Interests, &u.IsAnonymous, &u.CreatedAt); err != nil {
			return nil, err
		}
		if deviceID != nil {
			u.DeviceID = *deviceID
		}
		if email != nil {
			u.Email = *email
		}
		if passwordHash != nil {
			u.PasswordHash = *passwordHash
		}
		users = append(users, &u)
	}
	return users, rows.Err()
}

func nullIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func nullIfZero(i int64) any {
	if i == 0 {
		return nil
	}
	return i
}
