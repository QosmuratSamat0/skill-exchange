package domain

import (
	"context"
	"time"
)

// ---------------------------------------------------------------------------
// Core domain types
// ---------------------------------------------------------------------------

type Profile struct {
	UserID    string    `json:"user_id"`
	Name      string    `json:"name"      validate:"required,min=2,max=50"`
	IHave     []string  `json:"i_have"    validate:"required,min=1,max=10"` // Skills I can teach
	IWant     []string  `json:"i_want"    validate:"required,min=1,max=10"` // Skills I want to learn
	Bio       string    `json:"bio"        validate:"max=500"`
	UpdatedAt time.Time `json:"updated_at"`
}

type ExchangeRequest struct {
	ID                         string     `json:"id"`
	FromUserID                 string     `json:"from_user_id"`
	ToUserID                   string     `json:"to_user_id"`
	Status                     string     `json:"status"` // pending | accepted | declined | cancelled | completed
	SenderConfirmedComplete    bool       `json:"sender_confirmed_complete"`
	RecipientConfirmedComplete bool       `json:"recipient_confirmed_complete"`
	CreatedAt                  time.Time  `json:"created_at"`
	CompletedAt                *time.Time `json:"completed_at,omitempty"`
}

type ExchangeCompletedEvent struct {
	RequestID   string    `json:"request_id"`
	FromUserID  string    `json:"from_user_id"`
	ToUserID    string    `json:"to_user_id"`
	CompletedAt time.Time `json:"completed_at"`
}

type ExchangeCompletionTriggeredEvent struct {
	RequestID     string    `json:"request_id"`
	FromUserID    string    `json:"from_user_id"`
	ToUserID      string    `json:"to_user_id"`
	TriggeredByID string    `json:"triggered_by_id"`
	RecipientID   string    `json:"recipient_id"`
	TriggeredAt   time.Time `json:"triggered_at"`
}

type Room struct {
	ID        string    `json:"id"`
	UserA     string    `json:"user_a"`
	UserB     string    `json:"user_b"`
	CreatedAt time.Time `json:"created_at"`
}

type MatchNotification struct {
	Type    string      `json:"type"` // "request_received" | "request_accepted" | "request_declined" | "request_cancelled"
	Payload interface{} `json:"payload"`
}

// ---------------------------------------------------------------------------
// New expanded domain types
// ---------------------------------------------------------------------------

// SkillTag represents a categorised, levelled skill.
type SkillTag struct {
	Name     string `json:"name"`
	Category string `json:"category"` // "programming" | "design" | "language" | …
	Level    string `json:"level"`    // "beginner" | "intermediate" | "expert"
}

// UserStatus captures the real-time presence of a user.
type UserStatus struct {
	UserID      string    `json:"user_id"`
	IsOnline    bool      `json:"is_online"`
	LastSeen    time.Time `json:"last_seen"`
	IsSearching bool      `json:"is_searching"`
}

// MatchStats holds accumulated match statistics for a user.
type MatchStats struct {
	UserID        string    `json:"user_id"`
	TotalMatches  int       `json:"total_matches"`
	AcceptedCount int       `json:"accepted_count"`
	DeclinedCount int       `json:"declined_count"`
	Rating        float64   `json:"rating"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// InviteFilter is used to paginate / filter candidate queries.
type InviteFilter struct {
	Skills    []string `json:"skills"`
	MinRating float64  `json:"min_rating"`
	Limit     int      `json:"limit"`
	Offset    int      `json:"offset"`
}

// ---------------------------------------------------------------------------
// Repository interface
// ---------------------------------------------------------------------------

type MatchRepository interface {
	// Profile
	UpsertProfile(ctx context.Context, profile *Profile) error
	GetProfile(ctx context.Context, userID string) (*Profile, error)
	ListProfiles(ctx context.Context) ([]*Profile, error)
	DeleteProfile(ctx context.Context, userID string) error

	// Requests
	CreateRequest(ctx context.Context, req *ExchangeRequest) error
	GetRequest(ctx context.Context, reqID string) (*ExchangeRequest, error)
	UpdateRequestStatus(ctx context.Context, reqID, status string) error
	ConfirmRequestComplete(ctx context.Context, reqID, userID string) (*ExchangeRequest, bool, error)
	ListIncomingRequests(ctx context.Context, userID string) ([]*ExchangeRequest, error)
	ListSentRequests(ctx context.Context, userID string) ([]*ExchangeRequest, error)
	CancelRequest(ctx context.Context, reqID string) error

	// Rooms
	CreateRoom(ctx context.Context, room *Room) error
	GetRoom(ctx context.Context, userID string) (*Room, error)
	ListAllRooms(ctx context.Context, userID string) ([]*Room, error)

	// Notifications (pub/sub)
	PublishNotification(ctx context.Context, userID string, note *MatchNotification) error
	SubscribeToNotifications(ctx context.Context, userID string) (<-chan *MatchNotification, func(), error)

	// Skill index (Redis Sets: skill:teach:{skill} / skill:learn:{skill})
	IndexSkills(ctx context.Context, profile *Profile) error
	RemoveSkillIndex(ctx context.Context, userID string, iHave []string, iWant []string) error
	FindByTeachSkill(ctx context.Context, skill string) ([]string, error)
	FindByLearnSkill(ctx context.Context, skill string) ([]string, error)
	IntersectCandidates(ctx context.Context, teachSkills []string, learnSkills []string) ([]string, error)

	// User status  (TTL-based, key: user:status:{userID})
	SetUserStatus(ctx context.Context, status *UserStatus) error
	GetUserStatus(ctx context.Context, userID string) (*UserStatus, error)

	// Match stats  (key: user:stats:{userID})
	GetStats(ctx context.Context, userID string) (*MatchStats, error)
	UpdateStats(ctx context.Context, stats *MatchStats) error

	// Health
	HealthCheck(ctx context.Context) error
}

// ---------------------------------------------------------------------------
// External-service interfaces
// ---------------------------------------------------------------------------

type UserClient interface {
	IsBanned(ctx context.Context, userID string) (bool, error)
}

type ChatClient interface {
	CreateRoom(ctx context.Context, roomID string, userA, userB string) error
}

type MQPublisher interface {
	Publish(ctx context.Context, subject string, data interface{}) error
}

// ---------------------------------------------------------------------------
// Usecase interface
// ---------------------------------------------------------------------------

type MatchUsecase interface {
	// Profile management
	UpdateProfile(ctx context.Context, profile *Profile) error
	GetProfile(ctx context.Context, userID string) (*Profile, error)
	DeleteProfile(ctx context.Context, userID string) error

	// Candidate discovery
	GetCandidates(ctx context.Context, userID string) ([]*Profile, error)
	SearchCandidatesBySkill(ctx context.Context, skill string) ([]*Profile, error)
	GetSkillsByCategory(ctx context.Context, category string) ([]string, error)

	// Exchange requests
	SendRequest(ctx context.Context, fromUserID, toUserID string) error
	AcceptRequest(ctx context.Context, userID, requestID string) error
	DeclineRequest(ctx context.Context, userID, requestID string) error
	CompleteRequest(ctx context.Context, userID, requestID string) (*ExchangeRequest, error)
	GetMyRequests(ctx context.Context, userID string) ([]*ExchangeRequest, error)
	GetSentRequests(ctx context.Context, userID string) ([]*ExchangeRequest, error)
	CancelRequest(ctx context.Context, userID, requestID string) error

	// Rooms
	GetMyRoom(ctx context.Context, userID string) (*Room, error)
	GetAllRooms(ctx context.Context, userID string) ([]*Room, error)

	// User status
	SetOnlineStatus(ctx context.Context, userID string, online bool) error
	GetUserStatus(ctx context.Context, userID string) (*UserStatus, error)

	// Stats
	GetStats(ctx context.Context, userID string) (*MatchStats, error)

	// Notifications (SSE)
	SubscribeToNotifications(ctx context.Context, userID string) (<-chan *MatchNotification, func(), error)

	// Health
	HealthCheck(ctx context.Context) error
}
