package usecase

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/QosmuratSamat0/pairexx/user-service/internal/domain"
	"github.com/google/uuid"
	goredis "github.com/redis/go-redis/v9"
	"golang.org/x/crypto/bcrypt"
)

type userUsecase struct {
	repo         domain.UserRepository
	tokenManager *TokenManager
	rdb          *goredis.Client
}

func NewUserUsecase(repo domain.UserRepository, tm *TokenManager, rdb *goredis.Client) domain.UserUsecase {
	return &userUsecase{
		repo:         repo,
		tokenManager: tm,
		rdb:          rdb,
	}
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

func (u *userUsecase) CreateAnonymous(ctx context.Context, deviceID string) (string, string, error) {
	user, err := u.repo.GetByDeviceID(ctx, deviceID)
	if err != nil {
		if err.Error() != "user not found" {
			return "", "", err
		}
		user = &domain.User{
			ID:          uuid.New().String(),
			DeviceID:    deviceID,
			IsAnonymous: true,
			CreatedAt:   time.Now(),
		}
		if err := u.repo.Create(ctx, user); err != nil {
			return "", "", err
		}
	}
	return u.tokenManager.GeneratePair(user.ID)
}

func (u *userUsecase) Register(ctx context.Context, email, password string) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), 8)
	if err != nil {
		return err
	}
	user := &domain.User{
		ID:           uuid.New().String(),
		Email:        email,
		PasswordHash: string(hash),
		IsAnonymous:  false,
		CreatedAt:    time.Now(),
	}
	return u.repo.Create(ctx, user)
}

func (u *userUsecase) Login(ctx context.Context, email, password string) (string, string, error) {
	user, err := u.repo.GetByEmail(ctx, email)
	if err != nil {
		return "", "", errors.New("invalid credentials")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return "", "", errors.New("invalid credentials")
	}
	return u.tokenManager.GeneratePair(user.ID)
}

func (u *userUsecase) Refresh(ctx context.Context, refreshToken string) (string, string, error) {
	// Check token blacklist
	if u.rdb != nil {
		blacklistKey := fmt.Sprintf("token:blacklist:%s", refreshToken)
		exists, err := u.rdb.Exists(ctx, blacklistKey).Result()
		if err == nil && exists > 0 {
			return "", "", errors.New("token has been revoked")
		}
	}

	userID, err := u.tokenManager.ValidateAndGetSubject(refreshToken, "refresh")
	if err != nil {
		return "", "", err
	}
	return u.tokenManager.GeneratePair(userID)
}

func (u *userUsecase) Logout(ctx context.Context, refreshToken string) error {
	session, err := u.repo.GetSessionByToken(ctx, refreshToken)
	if err != nil {
		// Even if not found, try to blacklist the token
		u.blacklistToken(ctx, refreshToken)
		return nil
	}

	if err := u.repo.DeleteSession(ctx, session.ID); err != nil {
		return err
	}

	// Blacklist the token until it would expire
	u.blacklistToken(ctx, refreshToken)
	return nil
}

func (u *userUsecase) LogoutAll(ctx context.Context, userID string) error {
	// Get all sessions before deleting so we can blacklist their tokens
	sessions, err := u.repo.ListUserSessions(ctx, userID)
	if err != nil {
		return err
	}

	for _, s := range sessions {
		u.blacklistToken(ctx, s.RefreshToken)
	}

	if err := u.repo.DeleteAllUserSessions(ctx, userID); err != nil {
		return err
	}

	// Clear user cache
	if u.rdb != nil {
		_ = u.rdb.Del(ctx, "user:"+userID).Err()
	}
	return nil
}

// blacklistToken puts a refresh token into the Redis blacklist.
// TTL is set to the token's remaining lifetime (or refreshTTL if unavailable).
func (u *userUsecase) blacklistToken(ctx context.Context, token string) {
	if u.rdb == nil {
		return
	}
	ttl := u.tokenManager.refreshTTL
	// Try to get actual expiry from token claims
	if exp, err := u.tokenManager.GetExpiry(token); err == nil {
		remaining := time.Until(exp)
		if remaining > 0 {
			ttl = remaining
		}
	}
	key := fmt.Sprintf("token:blacklist:%s", token)
	_ = u.rdb.Set(ctx, key, "1", ttl).Err()
}

// ---------------------------------------------------------------------------
// Self / Profile
// ---------------------------------------------------------------------------

func (u *userUsecase) GetMe(ctx context.Context, userID string) (*domain.User, error) {
	if u.rdb != nil {
		key := "user:" + userID
		b, err := u.rdb.Get(ctx, key).Bytes()
		if err == nil {
			var user domain.User
			if jsonErr := json.Unmarshal(b, &user); jsonErr == nil {
				return &user, nil
			}
		}
	}

	user, err := u.repo.GetByID(ctx, userID)
	if err != nil {
		return nil, err
	}

	if u.rdb != nil {
		key := "user:" + userID
		if b, err := json.Marshal(user); err == nil {
			_ = u.rdb.Set(ctx, key, b, 5*time.Minute).Err()
		}
	}
	return user, nil
}

func (u *userUsecase) UpdateMe(ctx context.Context, userID string, gender string, interests []string) error {
	user, err := u.repo.GetByID(ctx, userID)
	if err != nil {
		return err
	}
	user.Gender = gender
	user.Interests = interests
	if err := u.repo.Update(ctx, user); err != nil {
		return err
	}
	if u.rdb != nil {
		_ = u.rdb.Del(ctx, "user:"+userID).Err()
	}
	return nil
}

func (u *userUsecase) UpdateProfile(ctx context.Context, userID string, profile *UserProfile) error {
	profile.UserID = userID
	profile.UpdatedAt = time.Now()

	if err := u.repo.UpsertProfile(ctx, (*domain.UserProfile)(profile)); err != nil {
		return err
	}

	// Cache in Redis
	if u.rdb != nil {
		key := fmt.Sprintf("user:profile:%s", userID)
		if b, err := json.Marshal(profile); err == nil {
			_ = u.rdb.Set(ctx, key, b, time.Hour).Err()
		}
	}
	return nil
}

// UserProfile alias to avoid import cycle – we work directly with domain.UserProfile
type UserProfile = domain.UserProfile

func (u *userUsecase) GetUserProfile(ctx context.Context, userID string) (*domain.UserProfile, error) {
	// Check Redis first
	if u.rdb != nil {
		key := fmt.Sprintf("user:profile:%s", userID)
		b, err := u.rdb.Get(ctx, key).Bytes()
		if err == nil {
			var p domain.UserProfile
			if jsonErr := json.Unmarshal(b, &p); jsonErr == nil {
				return &p, nil
			}
		}
	}

	p, err := u.repo.GetProfile(ctx, userID)
	if err != nil {
		return nil, err
	}

	// Populate cache
	if u.rdb != nil && p != nil {
		key := fmt.Sprintf("user:profile:%s", userID)
		if b, err := json.Marshal(p); err == nil {
			_ = u.rdb.Set(ctx, key, b, time.Hour).Err()
		}
	}
	return p, nil
}

func (u *userUsecase) GetPublicProfile(ctx context.Context, targetUserID string) (*domain.UserProfile, error) {
	return u.GetUserProfile(ctx, targetUserID)
}

func (u *userUsecase) UpdateEmailPreference(ctx context.Context, userID string, enabled bool) error {
	if err := u.repo.UpdateEmailPreference(ctx, userID, enabled); err != nil {
		return err
	}
	// Invalidate profile cache so the next GetUserProfile read sees the new value.
	if u.rdb != nil {
		key := fmt.Sprintf("user:profile:%s", userID)
		_ = u.rdb.Del(ctx, key).Err()
	}
	return nil
}

// GetEmailPreference reads the email_notifications_enabled flag directly from
// the database via the repository, bypassing the Redis profile cache.
// This is the safe read path for the notification pipeline: a profile cached
// before migration 0004 added this column would deserialise as false (Go
// zero value), silently suppressing all emails for that user.
func (u *userUsecase) GetEmailPreference(ctx context.Context, userID string) (bool, error) {
	return u.repo.GetEmailPreference(ctx, userID)
}

func (u *userUsecase) ChangePassword(ctx context.Context, userID, oldPassword, newPassword string) error {
	user, err := u.repo.GetByID(ctx, userID)
	if err != nil {
		return err
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(oldPassword)); err != nil {
		return errors.New("incorrect current password")
	}
	newHash, err := bcrypt.GenerateFromPassword([]byte(newPassword), 8)
	if err != nil {
		return err
	}
	user.PasswordHash = string(newHash)
	if err := u.repo.Update(ctx, user); err != nil {
		return err
	}
	if u.rdb != nil {
		_ = u.rdb.Del(ctx, "user:"+userID).Err()
	}
	return nil
}

func (u *userUsecase) DeleteAccount(ctx context.Context, userID, password string) error {
	user, err := u.repo.GetByID(ctx, userID)
	if err != nil {
		return err
	}
	// Only verify password for non-anonymous users
	if !user.IsAnonymous {
		if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
			return errors.New("incorrect password")
		}
	}

	// Delete all sessions first
	sessions, _ := u.repo.ListUserSessions(ctx, userID)
	for _, s := range sessions {
		u.blacklistToken(ctx, s.RefreshToken)
	}
	_ = u.repo.DeleteAllUserSessions(ctx, userID)

	// Clear caches
	if u.rdb != nil {
		_ = u.rdb.Del(ctx, "user:"+userID).Err()
		_ = u.rdb.Del(ctx, fmt.Sprintf("user:profile:%s", userID)).Err()
	}

	return u.repo.Delete(ctx, userID)
}

func (u *userUsecase) GetSessions(ctx context.Context, userID string) ([]*domain.UserSession, error) {
	return u.repo.ListUserSessions(ctx, userID)
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

func (u *userUsecase) AddReview(ctx context.Context, fromUserID, toUserID string, rating int, comment string) error {
	if rating < 1 || rating > 5 {
		return errors.New("rating must be between 1 and 5")
	}
	if fromUserID == toUserID {
		return errors.New("cannot review yourself")
	}

	// Ensure the target user exists
	if _, err := u.repo.GetByID(ctx, toUserID); err != nil {
		return errors.New("user not found")
	}

	review := &domain.Review{
		ID:         uuid.New().String(),
		FromUserID: fromUserID,
		ToUserID:   toUserID,
		Rating:     rating,
		Comment:    comment,
		CreatedAt:  time.Now(),
	}
	if err := u.repo.CreateReview(ctx, review); err != nil {
		return err
	}

	// Recalculate and store average rating in the user's profile
	avg, count, err := u.repo.GetAverageRating(ctx, toUserID)
	if err != nil {
		return nil // review created; just skip rating cache update
	}

	profile, _ := u.repo.GetProfile(ctx, toUserID)
	if profile == nil {
		profile = &domain.UserProfile{UserID: toUserID}
	}
	profile.Rating = avg
	profile.ReviewCount = count
	profile.UpdatedAt = time.Now()

	if err := u.repo.UpsertProfile(ctx, profile); err == nil && u.rdb != nil {
		key := fmt.Sprintf("user:profile:%s", toUserID)
		if b, err := json.Marshal(profile); err == nil {
			_ = u.rdb.Set(ctx, key, b, time.Hour).Err()
		}
	}

	return nil
}

func (u *userUsecase) GetReviews(ctx context.Context, userID string) ([]*domain.Review, error) {
	return u.repo.ListReviewsForUser(ctx, userID, 100, 0)
}

// ---------------------------------------------------------------------------
// Ban management
// ---------------------------------------------------------------------------

func (u *userUsecase) GetBanStatus(ctx context.Context, userID string) (*domain.Ban, bool, error) {
	ban, err := u.repo.GetActiveBan(ctx, userID)
	if err != nil {
		return nil, false, err
	}
	if ban == nil {
		return nil, false, nil
	}
	return ban, true, nil
}

func (u *userUsecase) BanUser(ctx context.Context, userID, reason, bannedBy string, duration time.Duration) error {
	ban := &domain.Ban{
		ID:        uuid.New().String(),
		UserID:    userID,
		Reason:    reason,
		BannedBy:  bannedBy,
		ExpiresAt: time.Now().Add(duration),
		CreatedAt: time.Now(),
	}
	return u.repo.CreateBan(ctx, ban)
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

func (u *userUsecase) ListUsers(ctx context.Context, limit, offset int) ([]*domain.User, error) {
	if limit <= 0 {
		limit = 20
	}
	if limit > 200 {
		limit = 200
	}
	return u.repo.ListAll(ctx, limit, offset)
}

func (u *userUsecase) UnbanUser(ctx context.Context, userID string) error {
	return u.repo.UnbanUser(ctx, userID)
}

func (u *userUsecase) ListBans(ctx context.Context, userID string) ([]*domain.Ban, error) {
	return u.repo.ListBans(ctx, userID)
}
