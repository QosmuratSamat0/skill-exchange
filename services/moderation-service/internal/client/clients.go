package client

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"
)

type UserClient struct {
	baseURL        string
	internalToken  string
	http           *http.Client
}

func NewUserClient(baseURL, internalToken string) *UserClient {
	return &UserClient{
		baseURL:       strings.TrimRight(baseURL, "/"),
		internalToken: internalToken,
		http:          &http.Client{Timeout: 3 * time.Second},
	}
}

func (c *UserClient) Ban(ctx context.Context, userID string, reason string, bannedBy string, hours int) error {
	payload := map[string]any{
		"user_id":   userID,
		"reason":    reason,
		"banned_by": bannedBy,
		"hours":     hours,
	}
	b, _ := json.Marshal(payload)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/internal/ban", bytes.NewReader(b))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Token", c.internalToken)

	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return errors.New("user-service non-success response")
	}
	return nil
}

type ChatClient struct {
	baseURL       string
	internalToken string
	http          *http.Client
}

func NewChatClient(baseURL, internalToken string) *ChatClient {
	return &ChatClient{
		baseURL:       strings.TrimRight(baseURL, "/"),
		internalToken: internalToken,
		http:          &http.Client{Timeout: 3 * time.Second},
	}
}

func (c *ChatClient) Disconnect(ctx context.Context, userID string) error {
	payload := map[string]any{"user_id": userID}
	b, _ := json.Marshal(payload)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/chat/internal/disconnect", bytes.NewReader(b))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Token", c.internalToken)

	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return errors.New("chat-service non-success response")
	}
	return nil
}

type NotificationClient struct {
	baseURL string
	http    *http.Client
	internalToken string
}

func NewNotificationClient(baseURL string, internalToken string) *NotificationClient {
	return &NotificationClient{
		baseURL: strings.TrimRight(baseURL, "/"),
		http:    &http.Client{Timeout: 3 * time.Second},
		internalToken: internalToken,
	}
}

func (c *NotificationClient) Notify(ctx context.Context, typ string, userID string, payload map[string]any) error {
	// Best-effort: notification-service может быть заглушкой.
	body := map[string]any{
		"type":    typ,
		"user_id": userID,
		"payload": payload,
	}
	b, _ := json.Marshal(body)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/notify", bytes.NewReader(b))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Token", c.internalToken)

	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusAccepted && resp.StatusCode != http.StatusCreated {
		return errors.New("notification-service non-success response")
	}
	return nil
}
