package client

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/sony/gobreaker/v2"
)

type UserClient struct {
	baseURL       string
	http          *http.Client
	internalToken string
	cb            *gobreaker.CircuitBreaker[bool]
}

func NewUserClient(baseURL string, internalToken string) *UserClient {
	settings := gobreaker.Settings{
		Name:        "User-Service",
		MaxRequests: 3,
		Interval:    10 * time.Second,
		Timeout:     5 * time.Second,
		ReadyToTrip: func(counts gobreaker.Counts) bool {
			failureRatio := float64(counts.TotalFailures) / float64(counts.Requests)
			return counts.Requests >= 5 && failureRatio >= 0.5
		},
	}

	return &UserClient{
		baseURL:       strings.TrimRight(baseURL, "/"),
		http:          &http.Client{Timeout: 3 * time.Second},
		internalToken: internalToken,
		cb:            gobreaker.NewCircuitBreaker[bool](settings),
	}
}

func (c *UserClient) IsBanned(ctx context.Context, userID string) (bool, error) {
	return c.cb.Execute(func() (bool, error) {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/users/"+userID+"/status", nil)
		if err != nil {
			return false, err
		}
		req.Header.Set("X-Internal-Token", c.internalToken)

		resp, err := c.http.Do(req)
		if err != nil {
			return false, err
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			return false, errors.New("user-service non-200 response")
		}

		var body struct {
			IsBanned bool `json:"is_banned"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
			return false, err
		}
		return body.IsBanned, nil
	})
}

type ChatClient struct {
	baseURL       string
	http          *http.Client
	internalToken string
	cb            *gobreaker.CircuitBreaker[interface{}]
}

func NewChatClient(baseURL string, internalToken string) *ChatClient {
	settings := gobreaker.Settings{
		Name:        "Chat-Service",
		MaxRequests: 3,
		Interval:    10 * time.Second,
		Timeout:     5 * time.Second,
		ReadyToTrip: func(counts gobreaker.Counts) bool {
			failureRatio := float64(counts.TotalFailures) / float64(counts.Requests)
			return counts.Requests >= 5 && failureRatio >= 0.5
		},
	}

	return &ChatClient{
		baseURL:       strings.TrimRight(baseURL, "/"),
		http:          &http.Client{Timeout: 3 * time.Second},
		internalToken: internalToken,
		cb:            gobreaker.NewCircuitBreaker[interface{}](settings),
	}
}

func (c *ChatClient) CreateRoom(ctx context.Context, roomID string, userA, userB string) error {
	_, err := c.cb.Execute(func() (interface{}, error) {
		payload := map[string]string{
			"id":     roomID,
			"user_a": userA,
			"user_b": userB,
		}
		b, _ := json.Marshal(payload)

		req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/chat/internal/rooms", bytes.NewReader(b))
		if err != nil {
			return nil, err
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Internal-Token", c.internalToken)

		resp, err := c.http.Do(req)
		if err != nil {
			return nil, err
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
			return nil, errors.New("chat-service non-success response")
		}
		return nil, nil
	})
	return err
}
