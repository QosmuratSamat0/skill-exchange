package redis

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	goredis "github.com/redis/go-redis/v9"

	"github.com/QosmuratSamat0/pairexx/matchmaking-service/internal/domain"
)

// ---------------------------------------------------------------------------
// Key constants
// ---------------------------------------------------------------------------

const (
	// Profile
	profileKeyPref  = "profile:"
	profilesListKey = "profiles"

	// Requests
	requestKeyPref      = "request:"
	userIncomingReqPref = "user:requests:incoming:"
	userSentReqPref     = "user:sent:"

	// Rooms
	userRoomPref  = "user:room:"
	roomKeyPref   = "room:"
	userRoomsPref = "user:rooms:" // list of all room IDs for a user

	// Skill indexes
	skillTeachPref = "skill:teach:" // SADD skill:teach:{skill} userID
	skillLearnPref = "skill:learn:" // SADD skill:learn:{skill} userID

	// Status / stats
	userStatusPref = "user:status:"
	userStatsPref  = "user:stats:"

	// Skill category index  (Hash: field=skill, value=category)
	skillCategoryKey = "skills:categories"

	// TTLs
	statusTTL  = 5 * time.Minute
	requestTTL = 24 * time.Hour
	roomTTL    = 72 * time.Hour
)

// ---------------------------------------------------------------------------
// Repository struct
// ---------------------------------------------------------------------------

type RedisMatchRepository struct {
	rdb *goredis.Client

	mu          sync.RWMutex
	subscribers map[string]chan *domain.MatchNotification
}

func NewRedisMatchRepository(redisURL string) (*RedisMatchRepository, error) {
	opts, err := parseRedisOptions(redisURL)
	if err != nil {
		return nil, err
	}
	rdb := goredis.NewClient(opts)
	repo := &RedisMatchRepository{
		rdb:         rdb,
		subscribers: make(map[string]chan *domain.MatchNotification),
	}

	go repo.startFanOut(context.Background())

	return repo, nil
}

func (r *RedisMatchRepository) Close() error {
	return r.rdb.Close()
}

// ---------------------------------------------------------------------------
// Internal fan-out for SSE notifications
// ---------------------------------------------------------------------------

func (r *RedisMatchRepository) startFanOut(ctx context.Context) {
	pubsub := r.rdb.Subscribe(ctx, "match:notifications")
	defer pubsub.Close()

	ch := pubsub.Channel()
	for msg := range ch {
		var payload struct {
			UserID string                    `json:"user_id"`
			Note   *domain.MatchNotification `json:"note"`
		}
		if err := json.Unmarshal([]byte(msg.Payload), &payload); err == nil {
			r.mu.RLock()
			subscriber, ok := r.subscribers[payload.UserID]
			r.mu.RUnlock()
			if ok {
				select {
				case subscriber <- payload.Note:
				default:
				}
			}
		}
	}
}

// ---------------------------------------------------------------------------
// Profile methods
// ---------------------------------------------------------------------------

func (r *RedisMatchRepository) UpsertProfile(ctx context.Context, p *domain.Profile) error {
	p.UpdatedAt = time.Now()
	data, _ := json.Marshal(p)

	pipe := r.rdb.Pipeline()
	pipe.Set(ctx, profileKeyPref+p.UserID, data, 0)
	pipe.SAdd(ctx, profilesListKey, p.UserID)
	_, err := pipe.Exec(ctx)
	return err
}

func (r *RedisMatchRepository) GetProfile(ctx context.Context, userID string) (*domain.Profile, error) {
	data, err := r.rdb.Get(ctx, profileKeyPref+userID).Bytes()
	if err != nil {
		if errors.Is(err, goredis.Nil) {
			return nil, nil
		}
		return nil, err
	}
	var p domain.Profile
	if err := json.Unmarshal(data, &p); err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *RedisMatchRepository) ListProfiles(ctx context.Context) ([]*domain.Profile, error) {
	userIDs, err := r.rdb.SMembers(ctx, profilesListKey).Result()
	if err != nil {
		return nil, err
	}
	if len(userIDs) == 0 {
		return nil, nil
	}

	pipe := r.rdb.Pipeline()
	cmds := make([]*goredis.StringCmd, len(userIDs))
	for i, id := range userIDs {
		cmds[i] = pipe.Get(ctx, profileKeyPref+id)
	}
	_, _ = pipe.Exec(ctx)

	var profiles []*domain.Profile
	for _, cmd := range cmds {
		data, err := cmd.Bytes()
		if err == nil {
			var p domain.Profile
			if err := json.Unmarshal(data, &p); err == nil {
				profiles = append(profiles, &p)
			}
		}
	}
	return profiles, nil
}

// DeleteProfile removes the profile, its skill indexes, and all auxiliary keys.
func (r *RedisMatchRepository) DeleteProfile(ctx context.Context, userID string) error {
	// Fetch profile first so we know which skills to de-index.
	p, err := r.GetProfile(ctx, userID)
	if err != nil {
		return err
	}
	if p != nil {
		if err := r.RemoveSkillIndex(ctx, userID, p.IHave, p.IWant); err != nil {
			return err
		}
	}

	pipe := r.rdb.Pipeline()
	pipe.Del(ctx, profileKeyPref+userID)
	pipe.SRem(ctx, profilesListKey, userID)
	// Also clean up auxiliary keys
	pipe.Del(ctx, userStatusPref+userID)
	pipe.Del(ctx, userStatsPref+userID)
	pipe.Del(ctx, userRoomsPref+userID)
	pipe.Del(ctx, userSentReqPref+userID)
	pipe.Del(ctx, userIncomingReqPref+userID)
	_, err = pipe.Exec(ctx)
	return err
}

// ---------------------------------------------------------------------------
// Request methods
// ---------------------------------------------------------------------------

func (r *RedisMatchRepository) CreateRequest(ctx context.Context, req *domain.ExchangeRequest) error {
	data, _ := json.Marshal(req)

	pipe := r.rdb.Pipeline()
	pipe.Set(ctx, requestKeyPref+req.ID, data, requestTTL)
	pipe.SAdd(ctx, userIncomingReqPref+req.ToUserID, req.ID)
	pipe.SAdd(ctx, userSentReqPref+req.FromUserID, req.ID)
	_, err := pipe.Exec(ctx)
	return err
}

func (r *RedisMatchRepository) GetRequest(ctx context.Context, reqID string) (*domain.ExchangeRequest, error) {
	data, err := r.rdb.Get(ctx, requestKeyPref+reqID).Bytes()
	if err != nil {
		if errors.Is(err, goredis.Nil) {
			return nil, nil
		}
		return nil, err
	}
	var req domain.ExchangeRequest
	if err := json.Unmarshal(data, &req); err != nil {
		return nil, err
	}
	return &req, nil
}

func (r *RedisMatchRepository) UpdateRequestStatus(ctx context.Context, reqID, status string) error {
	req, err := r.GetRequest(ctx, reqID)
	if err != nil {
		return err
	}
	if req == nil {
		return errors.New("request not found")
	}
	req.Status = status
	data, _ := json.Marshal(req)

	pipe := r.rdb.Pipeline()
	pipe.Set(ctx, requestKeyPref+reqID, data, requestTTL)
	// Keep accepted requests in both users' request sets so either participant
	// can continue to manage the active exchange after a page refresh.
	if status == "declined" || status == "cancelled" {
		pipe.SRem(ctx, userIncomingReqPref+req.ToUserID, reqID)
	}
	_, err = pipe.Exec(ctx)
	return err
}

func (r *RedisMatchRepository) ConfirmRequestComplete(ctx context.Context, reqID, userID string) (*domain.ExchangeRequest, bool, error) {
	key := requestKeyPref + reqID
	var updated *domain.ExchangeRequest
	var transitioned bool

	for attempt := 0; attempt < 3; attempt++ {
		err := r.rdb.Watch(ctx, func(tx *goredis.Tx) error {
			data, err := tx.Get(ctx, key).Bytes()
			if err != nil {
				if errors.Is(err, goredis.Nil) {
					return errors.New("request not found")
				}
				return err
			}

			var req domain.ExchangeRequest
			if err := json.Unmarshal(data, &req); err != nil {
				return err
			}

			if req.FromUserID != userID && req.ToUserID != userID {
				return errors.New("only exchange participants can complete this request")
			}
			if req.Status == "completed" {
				updated = &req
				transitioned = false
				return nil
			}
			if req.Status != "accepted" {
				return errors.New("only accepted requests can be completed")
			}

			if req.FromUserID == userID {
				req.SenderConfirmedComplete = true
			}
			if req.ToUserID == userID {
				req.RecipientConfirmedComplete = true
			}

			if req.SenderConfirmedComplete && req.RecipientConfirmedComplete {
				now := time.Now()
				req.Status = "completed"
				req.CompletedAt = &now
				transitioned = true
			} else {
				transitioned = false
			}

			nextData, _ := json.Marshal(&req)
			_, err = tx.TxPipelined(ctx, func(pipe goredis.Pipeliner) error {
				pipe.Set(ctx, key, nextData, requestTTL)
				if transitioned {
					pipe.Del(ctx, userRoomPref+req.FromUserID, userRoomPref+req.ToUserID)
				}
				return nil
			})
			if err != nil {
				return err
			}
			updated = &req
			return nil
		}, key)

		if errors.Is(err, goredis.TxFailedErr) {
			continue
		}
		return updated, transitioned, err
	}

	return nil, false, errors.New("failed to confirm request completion after retries")
}

func (r *RedisMatchRepository) ListIncomingRequests(ctx context.Context, userID string) ([]*domain.ExchangeRequest, error) {
	return r.listRequestsFromSet(ctx, userIncomingReqPref+userID)
}

func (r *RedisMatchRepository) ListSentRequests(ctx context.Context, userID string) ([]*domain.ExchangeRequest, error) {
	return r.listRequestsFromSet(ctx, userSentReqPref+userID)
}

// listRequestsFromSet is a shared helper that fetches all requests stored in a Redis Set.
func (r *RedisMatchRepository) listRequestsFromSet(ctx context.Context, setKey string) ([]*domain.ExchangeRequest, error) {
	reqIDs, err := r.rdb.SMembers(ctx, setKey).Result()
	if err != nil {
		return nil, err
	}
	if len(reqIDs) == 0 {
		return nil, nil
	}

	pipe := r.rdb.Pipeline()
	cmds := make([]*goredis.StringCmd, len(reqIDs))
	for i, id := range reqIDs {
		cmds[i] = pipe.Get(ctx, requestKeyPref+id)
	}
	_, _ = pipe.Exec(ctx)

	var requests []*domain.ExchangeRequest
	for _, cmd := range cmds {
		data, err := cmd.Bytes()
		if err == nil {
			var req domain.ExchangeRequest
			if err := json.Unmarshal(data, &req); err == nil {
				requests = append(requests, &req)
			}
		}
	}
	return requests, nil
}

// CancelRequest marks a request as cancelled and removes it from both inbox sets.
func (r *RedisMatchRepository) CancelRequest(ctx context.Context, reqID string) error {
	req, err := r.GetRequest(ctx, reqID)
	if err != nil {
		return err
	}
	if req == nil {
		return errors.New("request not found")
	}
	req.Status = "cancelled"
	data, _ := json.Marshal(req)

	pipe := r.rdb.Pipeline()
	pipe.Set(ctx, requestKeyPref+reqID, data, requestTTL)
	pipe.SRem(ctx, userIncomingReqPref+req.ToUserID, reqID)
	pipe.SRem(ctx, userSentReqPref+req.FromUserID, reqID)
	_, err = pipe.Exec(ctx)
	return err
}

// ---------------------------------------------------------------------------
// Room methods
// ---------------------------------------------------------------------------

func (r *RedisMatchRepository) CreateRoom(ctx context.Context, room *domain.Room) error {
	data, _ := json.Marshal(room)

	pipe := r.rdb.Pipeline()
	pipe.Set(ctx, roomKeyPref+room.ID, data, roomTTL)
	// Current-room pointer (single active room per user)
	pipe.Set(ctx, userRoomPref+room.UserA, room.ID, roomTTL)
	pipe.Set(ctx, userRoomPref+room.UserB, room.ID, roomTTL)
	// Append to the list of all rooms for each user
	pipe.RPush(ctx, userRoomsPref+room.UserA, room.ID)
	pipe.RPush(ctx, userRoomsPref+room.UserB, room.ID)
	_, err := pipe.Exec(ctx)
	return err
}

func (r *RedisMatchRepository) GetRoom(ctx context.Context, userID string) (*domain.Room, error) {
	roomID, err := r.rdb.Get(ctx, userRoomPref+userID).Result()
	if err != nil {
		if errors.Is(err, goredis.Nil) {
			return nil, nil
		}
		return nil, err
	}
	return r.getRoomByID(ctx, roomID)
}

func (r *RedisMatchRepository) ListAllRooms(ctx context.Context, userID string) ([]*domain.Room, error) {
	roomIDs, err := r.rdb.LRange(ctx, userRoomsPref+userID, 0, -1).Result()
	if err != nil {
		return nil, err
	}
	if len(roomIDs) == 0 {
		return nil, nil
	}

	// Deduplicate in case of concurrent writes
	seen := make(map[string]bool)
	var rooms []*domain.Room
	for _, id := range roomIDs {
		if seen[id] {
			continue
		}
		seen[id] = true
		room, err := r.getRoomByID(ctx, id)
		if err == nil && room != nil {
			rooms = append(rooms, room)
		}
	}
	return rooms, nil
}

func (r *RedisMatchRepository) getRoomByID(ctx context.Context, roomID string) (*domain.Room, error) {
	data, err := r.rdb.Get(ctx, roomKeyPref+roomID).Bytes()
	if err != nil {
		if errors.Is(err, goredis.Nil) {
			return nil, nil
		}
		return nil, err
	}
	var room domain.Room
	if err := json.Unmarshal(data, &room); err != nil {
		return nil, err
	}
	return &room, nil
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

func (r *RedisMatchRepository) PublishNotification(ctx context.Context, userID string, note *domain.MatchNotification) error {
	payload := struct {
		UserID string                    `json:"user_id"`
		Note   *domain.MatchNotification `json:"note"`
	}{
		UserID: userID,
		Note:   note,
	}
	b, _ := json.Marshal(payload)
	return r.rdb.Publish(ctx, "match:notifications", b).Err()
}

func (r *RedisMatchRepository) SubscribeToNotifications(ctx context.Context, userID string) (<-chan *domain.MatchNotification, func(), error) {
	ch := make(chan *domain.MatchNotification, 16)
	r.mu.Lock()
	r.subscribers[userID] = ch
	r.mu.Unlock()

	cleanup := func() {
		r.mu.Lock()
		delete(r.subscribers, userID)
		r.mu.Unlock()
		close(ch)
	}

	return ch, cleanup, nil
}

// ---------------------------------------------------------------------------
// Skill index methods
// ---------------------------------------------------------------------------

// IndexSkills adds the userID to the skill:teach:{skill} and skill:learn:{skill} Redis Sets.
func (r *RedisMatchRepository) IndexSkills(ctx context.Context, p *domain.Profile) error {
	if len(p.IHave) == 0 && len(p.IWant) == 0 {
		return nil
	}

	pipe := r.rdb.Pipeline()
	for _, skill := range p.IHave {
		pipe.SAdd(ctx, skillTeachPref+normaliseSkill(skill), p.UserID)
	}
	for _, skill := range p.IWant {
		pipe.SAdd(ctx, skillLearnPref+normaliseSkill(skill), p.UserID)
	}
	_, err := pipe.Exec(ctx)
	return err
}

// RemoveSkillIndex removes the userID from all skill index sets.
func (r *RedisMatchRepository) RemoveSkillIndex(ctx context.Context, userID string, iHave []string, iWant []string) error {
	if len(iHave) == 0 && len(iWant) == 0 {
		return nil
	}

	pipe := r.rdb.Pipeline()
	for _, skill := range iHave {
		pipe.SRem(ctx, skillTeachPref+normaliseSkill(skill), userID)
	}
	for _, skill := range iWant {
		pipe.SRem(ctx, skillLearnPref+normaliseSkill(skill), userID)
	}
	_, err := pipe.Exec(ctx)
	return err
}

// FindByTeachSkill returns all userIDs that teach the given skill.
func (r *RedisMatchRepository) FindByTeachSkill(ctx context.Context, skill string) ([]string, error) {
	return r.rdb.SMembers(ctx, skillTeachPref+normaliseSkill(skill)).Result()
}

// FindByLearnSkill returns all userIDs that want to learn the given skill.
func (r *RedisMatchRepository) FindByLearnSkill(ctx context.Context, skill string) ([]string, error) {
	return r.rdb.SMembers(ctx, skillLearnPref+normaliseSkill(skill)).Result()
}

// IntersectCandidates uses Redis SUNIONSTORE + SINTER to find users who appear in
// at least one teach-skill set (covering myIWant) AND at least one learn-skill set
// (covering myIHave).  Because Redis SINTER requires direct key names we build
// temporary union keys, SINTER them, then delete the temp keys.
func (r *RedisMatchRepository) IntersectCandidates(ctx context.Context, teachSkills []string, learnSkills []string) ([]string, error) {
	if len(teachSkills) == 0 || len(learnSkills) == 0 {
		return nil, nil
	}

	tmpTeach := fmt.Sprintf("tmp:teach:%d", time.Now().UnixNano())
	tmpLearn := fmt.Sprintf("tmp:learn:%d", time.Now().UnixNano())
	tmpInter := fmt.Sprintf("tmp:inter:%d", time.Now().UnixNano())

	teachKeys := make([]string, len(teachSkills))
	for i, s := range teachSkills {
		teachKeys[i] = skillTeachPref + normaliseSkill(s)
	}
	learnKeys := make([]string, len(learnSkills))
	for i, s := range learnSkills {
		learnKeys[i] = skillLearnPref + normaliseSkill(s)
	}

	pipe := r.rdb.Pipeline()
	pipe.SUnionStore(ctx, tmpTeach, teachKeys...)
	pipe.SUnionStore(ctx, tmpLearn, learnKeys...)
	pipe.Expire(ctx, tmpTeach, 10*time.Second)
	pipe.Expire(ctx, tmpLearn, 10*time.Second)
	if _, err := pipe.Exec(ctx); err != nil {
		return nil, err
	}

	// SINTERSTORE into tmpInter, then read members
	if err := r.rdb.SInterStore(ctx, tmpInter, tmpTeach, tmpLearn).Err(); err != nil {
		_, _ = r.rdb.Del(ctx, tmpTeach, tmpLearn).Result()
		return nil, err
	}
	_ = r.rdb.Expire(ctx, tmpInter, 10*time.Second)

	members, err := r.rdb.SMembers(ctx, tmpInter).Result()

	// Cleanup
	_, _ = r.rdb.Del(ctx, tmpTeach, tmpLearn, tmpInter).Result()

	return members, err
}

// ---------------------------------------------------------------------------
// User status methods
// ---------------------------------------------------------------------------

func (r *RedisMatchRepository) SetUserStatus(ctx context.Context, s *domain.UserStatus) error {
	s.LastSeen = time.Now()
	data, _ := json.Marshal(s)
	return r.rdb.Set(ctx, userStatusPref+s.UserID, data, statusTTL).Err()
}

func (r *RedisMatchRepository) GetUserStatus(ctx context.Context, userID string) (*domain.UserStatus, error) {
	data, err := r.rdb.Get(ctx, userStatusPref+userID).Bytes()
	if err != nil {
		if errors.Is(err, goredis.Nil) {
			// Return a sensible default when no status has been set yet.
			return &domain.UserStatus{
				UserID:   userID,
				IsOnline: false,
				LastSeen: time.Time{},
			}, nil
		}
		return nil, err
	}
	var s domain.UserStatus
	if err := json.Unmarshal(data, &s); err != nil {
		return nil, err
	}
	return &s, nil
}

// ---------------------------------------------------------------------------
// Match stats methods
// ---------------------------------------------------------------------------

func (r *RedisMatchRepository) GetStats(ctx context.Context, userID string) (*domain.MatchStats, error) {
	data, err := r.rdb.Get(ctx, userStatsPref+userID).Bytes()
	if err != nil {
		if errors.Is(err, goredis.Nil) {
			// Bootstrap empty stats
			return &domain.MatchStats{
				UserID:    userID,
				UpdatedAt: time.Now(),
			}, nil
		}
		return nil, err
	}
	var stats domain.MatchStats
	if err := json.Unmarshal(data, &stats); err != nil {
		return nil, err
	}
	return &stats, nil
}

func (r *RedisMatchRepository) UpdateStats(ctx context.Context, stats *domain.MatchStats) error {
	stats.UpdatedAt = time.Now()
	data, _ := json.Marshal(stats)
	return r.rdb.Set(ctx, userStatsPref+stats.UserID, data, 0).Err()
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

func (r *RedisMatchRepository) HealthCheck(ctx context.Context) error {
	return r.rdb.Ping(ctx).Err()
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func parseRedisOptions(redisURL string) (*goredis.Options, error) {
	if strings.HasPrefix(redisURL, "redis://") || strings.HasPrefix(redisURL, "rediss://") {
		return goredis.ParseURL(redisURL)
	}
	return &goredis.Options{Addr: redisURL}, nil
}

// normaliseSkill lowercases and trims a skill name for consistent key naming.
func normaliseSkill(skill string) string {
	return strings.ToLower(strings.TrimSpace(skill))
}
