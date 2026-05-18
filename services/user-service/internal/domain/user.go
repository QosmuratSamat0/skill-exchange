package domain

import (
	"context"
	"errors"
	"time"
)

var ErrUserAlreadyExists = errors.New("user already exists")

// ---------------------------------------------------------------------------
// Core entities
// ---------------------------------------------------------------------------

type User struct {
	ID           string    `json:"id"`
	DeviceID     string    `json:"device_id,omitempty"`
	Email        string    `json:"email,omitempty"`
	PasswordHash string    `json:"-"`
	Gender       string    `json:"gender"`
	Interests    []string  `json:"interests"`
	IsAnonymous  bool      `json:"is_anonymous"`
	CreatedAt    time.Time `json:"created_at"`
}

type Ban struct {
	ID        string    `json:"id"`
	UserID    string    `json:"user_id"`
	Reason    string    `json:"reason"`
	BannedBy  string    `json:"banned_by"`
	ExpiresAt time.Time `json:"expires_at"`
	CreatedAt time.Time `json:"created_at"`
}

type UserProfile struct {
	UserID                    string    `json:"user_id"`
	Name                      string    `json:"name"`
	Avatar                    string    `json:"avatar"`
	Bio                       string    `json:"bio"`
	ContactNumber             string    `json:"contact_number"` // phone / WhatsApp / Telegram
	TeachSkills               []string  `json:"teach_skills"`   // skills I can teach
	LearnSkills               []string  `json:"learn_skills"`   // skills I want to learn
	Rating                    float64   `json:"rating"`
	ReviewCount               int       `json:"review_count"`
	EmailNotificationsEnabled bool      `json:"email_notifications_enabled"`
	UpdatedAt                 time.Time `json:"updated_at"`
}

type Review struct {
	ID         string    `json:"id"`
	FromUserID string    `json:"from_user_id"`
	ToUserID   string    `json:"to_user_id"`
	Rating     int       `json:"rating"` // 1-5
	Comment    string    `json:"comment"`
	CreatedAt  time.Time `json:"created_at"`
}

type UserSession struct {
	ID           string    `json:"id"`
	UserID       string    `json:"user_id"`
	RefreshToken string    `json:"refresh_token"`
	UserAgent    string    `json:"user_agent"`
	IP           string    `json:"ip"`
	CreatedAt    time.Time `json:"created_at"`
	ExpiresAt    time.Time `json:"expires_at"`
}

type PasswordChangeRequest struct {
	OldPassword string `json:"old_password"`
	NewPassword string `json:"new_password"`
}

type DeleteAccountRequest struct {
	Password string `json:"password"` // confirmation
	Reason   string `json:"reason"`
}

// ---------------------------------------------------------------------------
// Repository interface
// ---------------------------------------------------------------------------

type UserRepository interface {
	// Core user CRUD
	Create(ctx context.Context, user *User) error
	GetByID(ctx context.Context, id string) (*User, error)
	GetByDeviceID(ctx context.Context, deviceID string) (*User, error)
	GetByEmail(ctx context.Context, email string) (*User, error)
	Update(ctx context.Context, user *User) error
	Delete(ctx context.Context, id string) error
	ListAll(ctx context.Context, limit, offset int) ([]*User, error)
	CountAll(ctx context.Context) (int, error)

	// Bans
	CreateBan(ctx context.Context, ban *Ban) error
	GetActiveBan(ctx context.Context, userID string) (*Ban, error)
	ListBans(ctx context.Context, userID string) ([]*Ban, error)
	UnbanUser(ctx context.Context, userID string) error

	// Profiles
	UpsertProfile(ctx context.Context, profile *UserProfile) error
	GetProfile(ctx context.Context, userID string) (*UserProfile, error)
	UpdateEmailPreference(ctx context.Context, userID string, enabled bool) error
	// GetEmailPreference reads ONLY the email_notifications_enabled column
	// directly from the database, bypassing any Redis profile cache.
	// Use this wherever a stale cached value would silently suppress emails.
	GetEmailPreference(ctx context.Context, userID string) (bool, error)

	// Reviews
	CreateReview(ctx context.Context, review *Review) error
	ListReviewsForUser(ctx context.Context, userID string, limit, offset int) ([]*Review, error)
	GetAverageRating(ctx context.Context, userID string) (float64, int, error)

	// Sessions
	CreateSession(ctx context.Context, session *UserSession) error
	GetSessionByToken(ctx context.Context, refreshToken string) (*UserSession, error)
	DeleteSession(ctx context.Context, sessionID string) error
	DeleteAllUserSessions(ctx context.Context, userID string) error
	ListUserSessions(ctx context.Context, userID string) ([]*UserSession, error)
}

// ---------------------------------------------------------------------------
// Usecase interface
// ---------------------------------------------------------------------------

type UserUsecase interface {
	// Auth
	CreateAnonymous(ctx context.Context, deviceID string) (string, string, error)
	Register(ctx context.Context, email, password string) error
	Login(ctx context.Context, email, password string) (string, string, error)
	Refresh(ctx context.Context, refreshToken string) (string, string, error)
	Logout(ctx context.Context, refreshToken string) error
	LogoutAll(ctx context.Context, userID string) error

	// Self
	GetMe(ctx context.Context, userID string) (*User, error)
	UpdateMe(ctx context.Context, userID string, gender string, interests []string) error
	UpdateProfile(ctx context.Context, userID string, profile *UserProfile) error
	GetUserProfile(ctx context.Context, userID string) (*UserProfile, error)
	GetPublicProfile(ctx context.Context, targetUserID string) (*UserProfile, error)
	ChangePassword(ctx context.Context, userID, oldPassword, newPassword string) error
	DeleteAccount(ctx context.Context, userID, password string) error
	GetSessions(ctx context.Context, userID string) ([]*UserSession, error)

	// Reviews
	AddReview(ctx context.Context, fromUserID, toUserID string, rating int, comment string) error
	GetReviews(ctx context.Context, userID string) ([]*Review, error)

	// Ban status (internal)
	GetBanStatus(ctx context.Context, userID string) (*Ban, bool, error)
	BanUser(ctx context.Context, userID, reason, bannedBy string, duration time.Duration) error

	// Admin
	ListUsers(ctx context.Context, limit, offset int) ([]*User, error)
	UnbanUser(ctx context.Context, userID string) error
	ListBans(ctx context.Context, userID string) ([]*Ban, error)
	UpdateEmailPreference(ctx context.Context, userID string, enabled bool) error
	// GetEmailPreference reads the toggle value directly from the database
	// without going through the Redis profile cache. Required in
	// GetUserPreferences to avoid returning a stale false that was cached
	// before migration 0004 added the column.
	GetEmailPreference(ctx context.Context, userID string) (bool, error)
}
