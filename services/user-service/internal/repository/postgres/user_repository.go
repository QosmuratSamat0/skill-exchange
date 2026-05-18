package postgres

import (
	"context"
	"errors"
	"sort"
	"sync"
	"time"

	"github.com/QosmuratSamat0/pairexx/user-service/internal/domain"
)

// InMemoryUserRepository is a stub for testing and initial development.
// It implements the full domain.UserRepository interface using in-memory maps.
type InMemoryUserRepository struct {
	mu              sync.RWMutex
	users           map[string]*domain.User        // key = userID
	bans            map[string][]*domain.Ban       // key = userID
	profiles        map[string]*domain.UserProfile // key = userID
	reviews         map[string][]*domain.Review    // key = toUserID
	sessions        map[string]*domain.UserSession // key = sessionID
	sessionsByToken map[string]*domain.UserSession // key = refreshToken
}

func NewInMemoryUserRepository() *InMemoryUserRepository {
	return &InMemoryUserRepository{
		users:           make(map[string]*domain.User),
		bans:            make(map[string][]*domain.Ban),
		profiles:        make(map[string]*domain.UserProfile),
		reviews:         make(map[string][]*domain.Review),
		sessions:        make(map[string]*domain.UserSession),
		sessionsByToken: make(map[string]*domain.UserSession),
	}
}

// ---------------------------------------------------------------------------
// Core user CRUD
// ---------------------------------------------------------------------------

func (r *InMemoryUserRepository) Create(ctx context.Context, user *domain.User) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, existing := range r.users {
		if user.Email != "" && existing.Email == user.Email {
			return domain.ErrUserAlreadyExists
		}
		if user.DeviceID != "" && existing.DeviceID == user.DeviceID {
			return domain.ErrUserAlreadyExists
		}
	}
	r.users[user.ID] = user
	return nil
}

func (r *InMemoryUserRepository) GetByID(ctx context.Context, id string) (*domain.User, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	user, ok := r.users[id]
	if !ok {
		return nil, errors.New("user not found")
	}
	return user, nil
}

func (r *InMemoryUserRepository) GetByDeviceID(ctx context.Context, deviceID string) (*domain.User, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for _, u := range r.users {
		if u.DeviceID == deviceID {
			return u, nil
		}
	}
	return nil, errors.New("user not found")
}

func (r *InMemoryUserRepository) GetByEmail(ctx context.Context, email string) (*domain.User, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for _, u := range r.users {
		if u.Email == email {
			return u, nil
		}
	}
	return nil, errors.New("user not found")
}

func (r *InMemoryUserRepository) Update(ctx context.Context, user *domain.User) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ok := r.users[user.ID]; !ok {
		return errors.New("user not found")
	}
	r.users[user.ID] = user
	return nil
}

func (r *InMemoryUserRepository) Delete(ctx context.Context, id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ok := r.users[id]; !ok {
		return errors.New("user not found")
	}
	delete(r.users, id)
	return nil
}

func (r *InMemoryUserRepository) ListAll(ctx context.Context, limit, offset int) ([]*domain.User, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	all := make([]*domain.User, 0, len(r.users))
	for _, u := range r.users {
		all = append(all, u)
	}
	// Sort by created_at DESC for consistency
	sort.Slice(all, func(i, j int) bool {
		return all[i].CreatedAt.After(all[j].CreatedAt)
	})

	if offset >= len(all) {
		return []*domain.User{}, nil
	}
	end := offset + limit
	if end > len(all) {
		end = len(all)
	}
	return all[offset:end], nil
}

func (r *InMemoryUserRepository) CountAll(ctx context.Context) (int, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.users), nil
}

// ---------------------------------------------------------------------------
// Bans
// ---------------------------------------------------------------------------

func (r *InMemoryUserRepository) CreateBan(ctx context.Context, ban *domain.Ban) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.bans[ban.UserID] = append(r.bans[ban.UserID], ban)
	return nil
}

func (r *InMemoryUserRepository) GetActiveBan(ctx context.Context, userID string) (*domain.Ban, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	bans, ok := r.bans[userID]
	if !ok || len(bans) == 0 {
		return nil, nil
	}
	ban := bans[len(bans)-1]
	if ban.ExpiresAt.Before(time.Now()) {
		return nil, nil
	}
	return ban, nil
}

func (r *InMemoryUserRepository) ListBans(ctx context.Context, userID string) ([]*domain.Ban, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	bans := r.bans[userID]
	result := make([]*domain.Ban, len(bans))
	copy(result, bans)
	return result, nil
}

func (r *InMemoryUserRepository) UnbanUser(ctx context.Context, userID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	now := time.Now()
	for _, ban := range r.bans[userID] {
		if ban.ExpiresAt.After(now) {
			ban.ExpiresAt = now
		}
	}
	return nil
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

func (r *InMemoryUserRepository) UpsertProfile(ctx context.Context, profile *domain.UserProfile) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	cp := *profile
	if cp.TeachSkills == nil {
		cp.TeachSkills = []string{}
	}
	if cp.LearnSkills == nil {
		cp.LearnSkills = []string{}
	}
	r.profiles[profile.UserID] = &cp
	return nil
}

func (r *InMemoryUserRepository) GetProfile(ctx context.Context, userID string) (*domain.UserProfile, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	p, ok := r.profiles[userID]
	if !ok {
		// Mirror the DB DEFAULT true so that new users who haven't saved a profile
		// yet still receive email notifications (matching pg_repository behaviour).
		return &domain.UserProfile{
			UserID:                    userID,
			TeachSkills:               []string{},
			LearnSkills:               []string{},
			EmailNotificationsEnabled: true,
		}, nil
	}
	cp := *p
	return &cp, nil
}

func (r *InMemoryUserRepository) GetEmailPreference(ctx context.Context, userID string) (bool, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	p, ok := r.profiles[userID]
	if !ok {
		return true, nil // no profile — default ON
	}
	return p.EmailNotificationsEnabled, nil
}

func (r *InMemoryUserRepository) UpdateEmailPreference(ctx context.Context, userID string, enabled bool) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	p, ok := r.profiles[userID]
	if !ok {
		// Create minimal profile with preference
		r.profiles[userID] = &domain.UserProfile{
			UserID:                    userID,
			EmailNotificationsEnabled: enabled,
			TeachSkills:               []string{},
			LearnSkills:               []string{},
		}
		return nil
	}
	p.EmailNotificationsEnabled = enabled
	return nil
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

func (r *InMemoryUserRepository) CreateReview(ctx context.Context, review *domain.Review) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	// Upsert: one review per (from, to) pair
	existing := r.reviews[review.ToUserID]
	for i, rv := range existing {
		if rv.FromUserID == review.FromUserID {
			existing[i] = review
			r.reviews[review.ToUserID] = existing
			return nil
		}
	}
	r.reviews[review.ToUserID] = append(r.reviews[review.ToUserID], review)
	return nil
}

func (r *InMemoryUserRepository) ListReviewsForUser(ctx context.Context, userID string, limit, offset int) ([]*domain.Review, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	all := r.reviews[userID]
	// Sort by created_at DESC
	sorted := make([]*domain.Review, len(all))
	copy(sorted, all)
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].CreatedAt.After(sorted[j].CreatedAt)
	})

	if offset >= len(sorted) {
		return []*domain.Review{}, nil
	}
	end := offset + limit
	if end > len(sorted) {
		end = len(sorted)
	}
	return sorted[offset:end], nil
}

func (r *InMemoryUserRepository) GetAverageRating(ctx context.Context, userID string) (float64, int, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	reviews := r.reviews[userID]
	if len(reviews) == 0 {
		return 0, 0, nil
	}
	total := 0
	for _, rv := range reviews {
		total += rv.Rating
	}
	avg := float64(total) / float64(len(reviews))
	return avg, len(reviews), nil
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

func (r *InMemoryUserRepository) CreateSession(ctx context.Context, session *domain.UserSession) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	cp := *session
	r.sessions[session.ID] = &cp
	r.sessionsByToken[session.RefreshToken] = &cp
	return nil
}

func (r *InMemoryUserRepository) GetSessionByToken(ctx context.Context, refreshToken string) (*domain.UserSession, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	s, ok := r.sessionsByToken[refreshToken]
	if !ok {
		return nil, errors.New("session not found")
	}
	cp := *s
	return &cp, nil
}

func (r *InMemoryUserRepository) DeleteSession(ctx context.Context, sessionID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	s, ok := r.sessions[sessionID]
	if !ok {
		return nil // idempotent
	}
	delete(r.sessionsByToken, s.RefreshToken)
	delete(r.sessions, sessionID)
	return nil
}

func (r *InMemoryUserRepository) DeleteAllUserSessions(ctx context.Context, userID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	for id, s := range r.sessions {
		if s.UserID == userID {
			delete(r.sessionsByToken, s.RefreshToken)
			delete(r.sessions, id)
		}
	}
	return nil
}

func (r *InMemoryUserRepository) ListUserSessions(ctx context.Context, userID string) ([]*domain.UserSession, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var result []*domain.UserSession
	for _, s := range r.sessions {
		if s.UserID == userID {
			cp := *s
			result = append(result, &cp)
		}
	}
	// Sort by created_at DESC
	sort.Slice(result, func(i, j int) bool {
		return result[i].CreatedAt.After(result[j].CreatedAt)
	})
	return result, nil
}
