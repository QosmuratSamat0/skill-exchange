package redis

import (
	"context"
	"testing"

	"github.com/QosmuratSamat0/pairexx/matchmaking-service/internal/domain"
	"github.com/alicebob/miniredis/v2"
	goredis "github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
)

func TestRedisMatchRepository_ProfileFlow(t *testing.T) {
	s := miniredis.RunT(t)
	rdb := goredis.NewClient(&goredis.Options{
		Addr: s.Addr(),
	})

	repo := &RedisMatchRepository{
		rdb: rdb,
	}

	ctx := context.Background()
	p := &domain.Profile{
		UserID: "user1",
		Name:   "Samat",
		IHave:  []string{"Go"},
		IWant:  []string{"React"},
	}

	// 1. Upsert profile
	err := repo.UpsertProfile(ctx, p)
	assert.NoError(t, err)

	// 2. Get profile
	got, err := repo.GetProfile(ctx, "user1")
	assert.NoError(t, err)
	assert.Equal(t, "Samat", got.Name)

	// 3. List profiles
	list, err := repo.ListProfiles(ctx)
	assert.NoError(t, err)
	assert.Len(t, list, 1)
}

func TestRedisMatchRepository_RequestFlow(t *testing.T) {
	s := miniredis.RunT(t)
	rdb := goredis.NewClient(&goredis.Options{
		Addr: s.Addr(),
	})

	repo := &RedisMatchRepository{
		rdb: rdb,
	}

	ctx := context.Background()
	req := &domain.ExchangeRequest{
		ID:         "req1",
		FromUserID: "user1",
		ToUserID:   "user2",
		Status:     "pending",
	}

	// 1. Create request
	err := repo.CreateRequest(ctx, req)
	assert.NoError(t, err)

	// 2. List incoming
	list, err := repo.ListIncomingRequests(ctx, "user2")
	assert.NoError(t, err)
	assert.Len(t, list, 1)
	assert.Equal(t, "user1", list[0].FromUserID)

	// 3. Accept
	err = repo.UpdateRequestStatus(ctx, "req1", "accepted")
	assert.NoError(t, err)

	updated, _ := repo.GetRequest(ctx, "req1")
	assert.Equal(t, "accepted", updated.Status)

	incoming, err := repo.ListIncomingRequests(ctx, "user2")
	assert.NoError(t, err)
	assert.Len(t, incoming, 1)
}

func TestRedisMatchRepository_ConfirmRequestCompleteRequiresBothParticipants(t *testing.T) {
	s := miniredis.RunT(t)
	rdb := goredis.NewClient(&goredis.Options{
		Addr: s.Addr(),
	})

	repo := &RedisMatchRepository{
		rdb: rdb,
	}

	ctx := context.Background()
	req := &domain.ExchangeRequest{
		ID:         "req1",
		FromUserID: "sender",
		ToUserID:   "recipient",
		Status:     "accepted",
	}

	err := repo.CreateRequest(ctx, req)
	assert.NoError(t, err)

	updated, transitioned, err := repo.ConfirmRequestComplete(ctx, "req1", "sender")
	assert.NoError(t, err)
	assert.False(t, transitioned)
	assert.Equal(t, "accepted", updated.Status)
	assert.True(t, updated.SenderConfirmedComplete)
	assert.False(t, updated.RecipientConfirmedComplete)

	updated, transitioned, err = repo.ConfirmRequestComplete(ctx, "req1", "recipient")
	assert.NoError(t, err)
	assert.True(t, transitioned)
	assert.Equal(t, "completed", updated.Status)
	assert.True(t, updated.SenderConfirmedComplete)
	assert.True(t, updated.RecipientConfirmedComplete)
	assert.NotNil(t, updated.CompletedAt)
}
