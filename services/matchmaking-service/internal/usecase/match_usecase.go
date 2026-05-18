package usecase

import (
	"context"
	"errors"
	"fmt"
	"log"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/QosmuratSamat0/pairexx/matchmaking-service/internal/domain"
)

// ---------------------------------------------------------------------------
// Known skill categories (used by GetSkillsByCategory)
// ---------------------------------------------------------------------------

var skillCategories = map[string][]string{
	"programming": {
		"Go", "Python", "JavaScript", "TypeScript", "Rust", "Java", "C++", "C#",
		"Ruby", "PHP", "Swift", "Kotlin", "Scala", "Haskell", "Elixir",
	},
	"frontend": {
		"React", "Vue", "Angular", "Svelte", "HTML", "CSS", "SASS", "Tailwind",
		"Next.js", "Nuxt.js", "Astro",
	},
	"backend": {
		"Node.js", "Django", "FastAPI", "Spring Boot", "Rails", "Laravel",
		"ASP.NET", "Gin", "Echo", "Fiber",
	},
	"database": {
		"PostgreSQL", "MySQL", "MongoDB", "Redis", "Cassandra", "Elasticsearch",
		"SQLite", "DynamoDB", "CockroachDB",
	},
	"devops": {
		"Docker", "Kubernetes", "Terraform", "Ansible", "GitHub Actions",
		"Jenkins", "ArgoCD", "Helm", "Prometheus", "Grafana",
	},
	"design": {
		"Figma", "Sketch", "Adobe XD", "Photoshop", "Illustrator",
		"UI Design", "UX Research", "Prototyping",
	},
	"language": {
		"English", "Spanish", "French", "German", "Japanese", "Chinese",
		"Russian", "Arabic", "Portuguese", "Korean",
	},
	"data": {
		"Machine Learning", "Deep Learning", "NLP", "Computer Vision",
		"Data Analysis", "Pandas", "NumPy", "TensorFlow", "PyTorch",
	},
}

// ---------------------------------------------------------------------------
// Struct & constructor
// ---------------------------------------------------------------------------

type matchUsecase struct {
	repo       domain.MatchRepository
	chatClient domain.ChatClient
	mq         domain.MQPublisher
}

func NewMatchUsecase(
	repo domain.MatchRepository,
	chat domain.ChatClient,
	mq domain.MQPublisher,
) domain.MatchUsecase {
	return &matchUsecase{
		repo:       repo,
		chatClient: chat,
		mq:         mq,
	}
}

// ---------------------------------------------------------------------------
// Profile management
// ---------------------------------------------------------------------------

// UpdateProfile upserts a profile and rebuilds its skill indexes atomically.
func (u *matchUsecase) UpdateProfile(ctx context.Context, p *domain.Profile) error {
	// Remove stale skill indexes if a previous profile existed.
	existing, err := u.repo.GetProfile(ctx, p.UserID)
	if err != nil {
		return err
	}
	if existing != nil {
		if err := u.repo.RemoveSkillIndex(ctx, p.UserID, existing.IHave, existing.IWant); err != nil {
			return err
		}
	}

	if err := u.repo.UpsertProfile(ctx, p); err != nil {
		return err
	}

	return u.repo.IndexSkills(ctx, p)
}

// GetProfile returns a single profile by user ID.
func (u *matchUsecase) GetProfile(ctx context.Context, userID string) (*domain.Profile, error) {
	p, err := u.repo.GetProfile(ctx, userID)
	if err != nil {
		return nil, err
	}
	if p == nil {
		return nil, errors.New("profile not found")
	}
	return p, nil
}

// DeleteProfile removes all profile data including skill indexes.
func (u *matchUsecase) DeleteProfile(ctx context.Context, userID string) error {
	return u.repo.DeleteProfile(ctx, userID)
}

// ---------------------------------------------------------------------------
// Candidate discovery
// ---------------------------------------------------------------------------

// GetCandidates returns the best skill-exchange candidates for the caller.
//
// Algorithm (three-tier weighted scoring):
//
//	Primary   (bidirectional match): score 70-100  — both teach ∩ want
//	Secondary (they teach me):        score 40-65   — supply focus
//	Tertiary  (I teach them):         score 10-35   — demand focus
//	Exploration (score == 0):         shown last    — prevents blank feed
//
// The former Redis-SINTER fast-path required exact normalised key matches
// ("Python" ≠ "Python 3") and silently produced an empty feed for partial
// matches.  We now always run the full-scan scorer which uses case-insensitive
// substring matching so no valid match is ever missed.
func (u *matchUsecase) GetCandidates(ctx context.Context, userID string) ([]*domain.Profile, error) {
	myProfile, err := u.repo.GetProfile(ctx, userID)
	if err != nil {
		return nil, err
	}
	if myProfile == nil {
		return nil, errors.New("profile not found: create a profile first")
	}

	// Always run the full weighted scan — never rely on exact SINTER keys.
	return u.scoredCandidates(ctx, userID, myProfile)
}

// scoredCandidates loads every stored profile, scores it against the caller's
// profile using the three-tier weighted algorithm, and returns up to maxFeed
// results ordered by score DESC.
//
// Feed guarantee: if matched profiles (score > 0) are fewer than minFeedPad,
// unmatched profiles are appended in alphabetical order so the feed is never
// completely blank as long as at least one other user exists in the system.
func (u *matchUsecase) scoredCandidates(ctx context.Context, userID string, myProfile *domain.Profile) ([]*domain.Profile, error) {
	const (
		maxFeed    = 20 // maximum cards returned
		minFeedPad = 5  // pad with exploration profiles if matched < this
	)

	allProfiles, err := u.repo.ListProfiles(ctx)
	if err != nil {
		return nil, err
	}

	type entry struct {
		p     *domain.Profile
		score int
	}

	var matched []entry           // score > 0  — real skill overlap
	var explore []*domain.Profile // score == 0 — shown as padding

	for _, p := range allProfiles {
		if p.UserID == userID {
			continue
		}
		sc := CalculateMatchScore(myProfile, p)
		if sc > 0 {
			matched = append(matched, entry{p: p, score: sc})
		} else {
			explore = append(explore, p)
		}
	}

	// Sort matched by score descending (Primary → Secondary → Tertiary).
	sort.Slice(matched, func(i, j int) bool {
		return matched[i].score > matched[j].score
	})

	out := make([]*domain.Profile, 0, maxFeed)
	for _, e := range matched {
		if len(out) >= maxFeed {
			break
		}
		out = append(out, e.p)
	}

	// Pad with exploration profiles so the feed is never blank.
	if len(out) < minFeedPad {
		for _, p := range explore {
			if len(out) >= maxFeed {
				break
			}
			out = append(out, p)
		}
	}

	return out, nil
}

// getCandidatesFallback is retained for any callers that still need it;
// it delegates to scoredCandidates.
func (u *matchUsecase) getCandidatesFallback(ctx context.Context, userID string, myProfile *domain.Profile) ([]*domain.Profile, error) {
	return u.scoredCandidates(ctx, userID, myProfile)
}

// SearchCandidatesBySkill returns profiles whose skills partially match the query.
// It does a full in-memory scan so short tech names like "Go" correctly match
// stored values like "Golang", "go", "GO", etc.
func (u *matchUsecase) SearchCandidatesBySkill(ctx context.Context, skill string) ([]*domain.Profile, error) {
	qNorm := strings.ToLower(strings.TrimSpace(skill))
	if qNorm == "" {
		return nil, errors.New("skill query is empty")
	}

	allProfiles, err := u.repo.ListProfiles(ctx)
	if err != nil {
		return nil, err
	}

	seen := make(map[string]struct{})
	var matched []*domain.Profile

	for _, p := range allProfiles {
		if _, already := seen[p.UserID]; already {
			continue
		}
		matched_ := false
		// Match against i_have (teaches the skill)
		for _, s := range p.IHave {
			sn := strings.ToLower(strings.TrimSpace(s))
			if sn == qNorm || strings.Contains(sn, qNorm) || strings.Contains(qNorm, sn) {
				matched_ = true
				break
			}
		}
		// Also match against i_want (wants to learn the skill)
		if !matched_ {
			for _, s := range p.IWant {
				sn := strings.ToLower(strings.TrimSpace(s))
				if sn == qNorm || strings.Contains(sn, qNorm) || strings.Contains(qNorm, sn) {
					matched_ = true
					break
				}
			}
		}
		if matched_ {
			seen[p.UserID] = struct{}{}
			matched = append(matched, p)
		}
	}
	return matched, nil
}

// GetSkillsByCategory returns the known skills for a given category.
func (u *matchUsecase) GetSkillsByCategory(ctx context.Context, category string) ([]string, error) {
	cat := strings.ToLower(strings.TrimSpace(category))
	skills, ok := skillCategories[cat]
	if !ok {
		return nil, errors.New("unknown category: " + category)
	}
	return skills, nil
}

// ---------------------------------------------------------------------------
// Exchange requests
// ---------------------------------------------------------------------------

// SendRequest creates and broadcasts a new exchange request.
func (u *matchUsecase) SendRequest(ctx context.Context, fromUserID, toUserID string) error {
	if fromUserID == toUserID {
		return errors.New("cannot send request to yourself")
	}

	req := &domain.ExchangeRequest{
		ID:         uuid.New().String(),
		FromUserID: fromUserID,
		ToUserID:   toUserID,
		Status:     "pending",
		CreatedAt:  time.Now(),
	}

	if err := u.repo.CreateRequest(ctx, req); err != nil {
		return err
	}

	_ = u.repo.PublishNotification(ctx, toUserID, &domain.MatchNotification{
		Type:    "request_received",
		Payload: req,
	})

	return nil
}

// AcceptRequest accepts a pending request, creates a room, and updates stats.
func (u *matchUsecase) AcceptRequest(ctx context.Context, userID, requestID string) error {
	req, err := u.repo.GetRequest(ctx, requestID)
	if err != nil {
		return err
	}
	if req == nil || req.ToUserID != userID {
		return errors.New("request not found or not addressed to you")
	}
	if req.Status != "pending" {
		return errors.New("request is already processed")
	}

	if err := u.repo.UpdateRequestStatus(ctx, requestID, "accepted"); err != nil {
		return err
	}

	// Create room
	roomID := uuid.New().String()
	room := &domain.Room{
		ID:        roomID,
		UserA:     req.FromUserID,
		UserB:     req.ToUserID,
		CreatedAt: time.Now(),
	}
	if err := u.repo.CreateRoom(ctx, room); err != nil {
		return err
	}

	// Inform the chat service (non-fatal if it fails)
	if err := u.chatClient.CreateRoom(ctx, roomID, req.FromUserID, req.ToUserID); err != nil {
		log.Printf("[AcceptRequest] failed to create chat room: %v", err)
	}

	// Update stats for both participants
	u.incrementStat(ctx, req.FromUserID, func(s *domain.MatchStats) {
		s.TotalMatches++
		s.AcceptedCount++
	})
	u.incrementStat(ctx, req.ToUserID, func(s *domain.MatchStats) {
		s.TotalMatches++
		s.AcceptedCount++
	})

	// Notify both users
	note := &domain.MatchNotification{Type: "request_accepted", Payload: room}
	_ = u.repo.PublishNotification(ctx, req.FromUserID, note)
	_ = u.repo.PublishNotification(ctx, req.ToUserID, note)

	return nil
}

// DeclineRequest declines a pending request and updates the decliner's stats.
func (u *matchUsecase) DeclineRequest(ctx context.Context, userID, requestID string) error {
	req, err := u.repo.GetRequest(ctx, requestID)
	if err != nil {
		return err
	}
	if req == nil || req.ToUserID != userID {
		return errors.New("request not found or not addressed to you")
	}
	if req.Status != "pending" {
		return errors.New("request is already processed")
	}

	if err := u.repo.UpdateRequestStatus(ctx, requestID, "declined"); err != nil {
		return err
	}

	u.incrementStat(ctx, userID, func(s *domain.MatchStats) {
		s.DeclinedCount++
	})

	_ = u.repo.PublishNotification(ctx, req.FromUserID, &domain.MatchNotification{
		Type:    "request_declined",
		Payload: req,
	})

	return nil
}

// CompleteRequest records one participant's completion confirmation. The first
// confirmation prompts the other participant; the second transitions the
// exchange to completed and emits the final completion event.
func (u *matchUsecase) CompleteRequest(ctx context.Context, userID, requestID string) (*domain.ExchangeRequest, error) {
	req, err := u.repo.GetRequest(ctx, requestID)
	if err != nil {
		return nil, err
	}
	if req == nil {
		return nil, errors.New("request not found")
	}
	if req.FromUserID != userID && req.ToUserID != userID {
		return nil, errors.New("only exchange participants can complete this request")
	}
	if req.Status != "accepted" && req.Status != "completed" {
		return nil, fmt.Errorf("only accepted requests can be completed")
	}
	hadConfirmed := (req.FromUserID == userID && req.SenderConfirmedComplete) ||
		(req.ToUserID == userID && req.RecipientConfirmedComplete)

	updated, transitioned, err := u.repo.ConfirmRequestComplete(ctx, requestID, userID)
	if err != nil {
		return nil, err
	}

	if transitioned {
		completedAt := time.Now()
		if updated.CompletedAt != nil {
			completedAt = *updated.CompletedAt
		}

		event := &domain.ExchangeCompletedEvent{
			RequestID:   updated.ID,
			FromUserID:  updated.FromUserID,
			ToUserID:    updated.ToUserID,
			CompletedAt: completedAt,
		}
		if u.mq != nil {
			if err := u.mq.Publish(ctx, "exchange.completed", event); err != nil {
				log.Printf("[CompleteRequest] failed to publish exchange.completed: %v", err)
			}
		}

		note := &domain.MatchNotification{Type: "exchange_completed", Payload: updated}
		_ = u.repo.PublishNotification(ctx, updated.FromUserID, note)
		_ = u.repo.PublishNotification(ctx, updated.ToUserID, note)
	} else if !hadConfirmed && updated.Status == "accepted" {
		recipientID := updated.FromUserID
		if userID == updated.FromUserID {
			recipientID = updated.ToUserID
		}
		event := &domain.ExchangeCompletionTriggeredEvent{
			RequestID:     updated.ID,
			FromUserID:    updated.FromUserID,
			ToUserID:      updated.ToUserID,
			TriggeredByID: userID,
			RecipientID:   recipientID,
			TriggeredAt:   time.Now(),
		}
		if u.mq != nil {
			if err := u.mq.Publish(ctx, "exchange.completion_triggered", event); err != nil {
				log.Printf("[CompleteRequest] failed to publish exchange.completion_triggered: %v", err)
			}
		}

		_ = u.repo.PublishNotification(ctx, recipientID, &domain.MatchNotification{
			Type:    "exchange_completion_triggered",
			Payload: updated,
		})
	}

	return updated, nil
}

// GetMyRequests returns incoming (pending) requests for a user.
func (u *matchUsecase) GetMyRequests(ctx context.Context, userID string) ([]*domain.ExchangeRequest, error) {
	return u.repo.ListIncomingRequests(ctx, userID)
}

// GetSentRequests returns all requests the user has sent.
func (u *matchUsecase) GetSentRequests(ctx context.Context, userID string) ([]*domain.ExchangeRequest, error) {
	return u.repo.ListSentRequests(ctx, userID)
}

// CancelRequest allows the sender to cancel a pending request they sent.
func (u *matchUsecase) CancelRequest(ctx context.Context, userID, requestID string) error {
	req, err := u.repo.GetRequest(ctx, requestID)
	if err != nil {
		return err
	}
	if req == nil {
		return errors.New("request not found")
	}
	if req.FromUserID != userID {
		return errors.New("only the sender can cancel a request")
	}
	if req.Status != "pending" {
		return errors.New("only pending requests can be cancelled")
	}

	if err := u.repo.CancelRequest(ctx, requestID); err != nil {
		return err
	}

	_ = u.repo.PublishNotification(ctx, req.ToUserID, &domain.MatchNotification{
		Type:    "request_cancelled",
		Payload: req,
	})

	return nil
}

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

// GetMyRoom returns the user's current active room.
func (u *matchUsecase) GetMyRoom(ctx context.Context, userID string) (*domain.Room, error) {
	room, err := u.repo.GetRoom(ctx, userID)
	if err != nil {
		return nil, err
	}
	if room == nil {
		return nil, errors.New("no active room found")
	}
	return room, nil
}

// GetAllRooms returns all rooms the user has ever been part of.
func (u *matchUsecase) GetAllRooms(ctx context.Context, userID string) ([]*domain.Room, error) {
	return u.repo.ListAllRooms(ctx, userID)
}

// ---------------------------------------------------------------------------
// User status
// ---------------------------------------------------------------------------

// SetOnlineStatus updates the user's online/offline presence with a TTL.
func (u *matchUsecase) SetOnlineStatus(ctx context.Context, userID string, online bool) error {
	status := &domain.UserStatus{
		UserID:   userID,
		IsOnline: online,
		LastSeen: time.Now(),
	}
	return u.repo.SetUserStatus(ctx, status)
}

// GetUserStatus returns the current status of the given user.
func (u *matchUsecase) GetUserStatus(ctx context.Context, userID string) (*domain.UserStatus, error) {
	return u.repo.GetUserStatus(ctx, userID)
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

// GetStats returns accumulated match statistics for a user.
func (u *matchUsecase) GetStats(ctx context.Context, userID string) (*domain.MatchStats, error) {
	return u.repo.GetStats(ctx, userID)
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

func (u *matchUsecase) SubscribeToNotifications(ctx context.Context, userID string) (<-chan *domain.MatchNotification, func(), error) {
	return u.repo.SubscribeToNotifications(ctx, userID)
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

func (u *matchUsecase) HealthCheck(ctx context.Context) error {
	return u.repo.HealthCheck(ctx)
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// incrementStat is a fire-and-forget helper that reads, mutates, and writes stats.
func (u *matchUsecase) incrementStat(ctx context.Context, userID string, mutate func(*domain.MatchStats)) {
	stats, err := u.repo.GetStats(ctx, userID)
	if err != nil {
		log.Printf("[incrementStat] failed to get stats for %s: %v", userID, err)
		return
	}
	mutate(stats)
	if err := u.repo.UpdateStats(ctx, stats); err != nil {
		log.Printf("[incrementStat] failed to update stats for %s: %v", userID, err)
	}
}
