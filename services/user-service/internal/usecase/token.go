package usecase

import (
	"encoding/json"
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type TokenManager struct {
	secret     []byte
	accessTTL  time.Duration
	refreshTTL time.Duration
}

func NewTokenManager(secret string, accessTTL, refreshTTL time.Duration) *TokenManager {
	return &TokenManager{
		secret:     []byte(secret),
		accessTTL:  accessTTL,
		refreshTTL: refreshTTL,
	}
}

func (m *TokenManager) GeneratePair(userID string) (string, string, error) {
	accessToken, err := m.GenerateToken(userID, m.accessTTL, "access")
	if err != nil {
		return "", "", err
	}

	refreshToken, err := m.GenerateToken(userID, m.refreshTTL, "refresh")
	if err != nil {
		return "", "", err
	}

	return accessToken, refreshToken, nil
}

func (m *TokenManager) GenerateToken(userID string, ttl time.Duration, typ string) (string, error) {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": userID,
		"exp": time.Now().Add(ttl).Unix(),
		"iat": time.Now().Unix(),
		"typ": typ,
	})

	return token.SignedString(m.secret)
}

// GetExpiry parses the token (without full validation) and returns the expiry time.
func (m *TokenManager) GetExpiry(tokenString string) (time.Time, error) {
	token, _, err := new(jwt.Parser).ParseUnverified(tokenString, jwt.MapClaims{})
	if err != nil {
		return time.Time{}, err
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return time.Time{}, errors.New("invalid claims")
	}
	expVal, ok := claims["exp"]
	if !ok {
		return time.Time{}, errors.New("no exp claim")
	}
	switch v := expVal.(type) {
	case float64:
		return time.Unix(int64(v), 0), nil
	case json.Number:
		n, err := v.Int64()
		if err != nil {
			return time.Time{}, err
		}
		return time.Unix(n, 0), nil
	}
	return time.Time{}, errors.New("unexpected exp type")
}

func (m *TokenManager) ValidateAndGetSubject(tokenString string, expectedType string) (string, error) {
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		return m.secret, nil
	})
	if err != nil || !token.Valid {
		return "", errors.New("invalid token")
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return "", errors.New("invalid claims")
	}

	if expectedType != "" {
		typ, _ := claims["typ"].(string)
		if typ != expectedType {
			return "", errors.New("invalid token type")
		}
	}

	sub, ok := claims["sub"].(string)
	if !ok || sub == "" {
		return "", errors.New("invalid subject")
	}
	return sub, nil
}
