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

type ModerationClient struct {
	baseURL       string
	internalToken string
	http          *http.Client
}

func NewModerationClient(baseURL, internalToken string) *ModerationClient {
	return &ModerationClient{
		baseURL:       strings.TrimRight(baseURL, "/"),
		internalToken: internalToken,
		http:          &http.Client{Timeout: 2 * time.Second},
	}
}

func (c *ModerationClient) IsToxic(ctx context.Context, content string) (bool, error) {
	if c.baseURL == "" {
		return false, nil
	}
	body, _ := json.Marshal(map[string]string{"content": content})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/moderate/message", bytes.NewReader(body))
	if err != nil {
		return false, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Token", c.internalToken)

	resp, err := c.http.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return false, errors.New("moderation-service non-success response")
	}

	var out struct {
		Toxic bool `json:"toxic"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return false, err
	}
	return out.Toxic, nil
}

