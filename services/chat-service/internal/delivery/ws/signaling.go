package ws

import (
	"time"
)

type SignalingMessage struct {
	Type      string `json:"type"` // "rtc:offer", "rtc:answer", "rtc:ice-candidate"
	To        string `json:"to"`
	From      string `json:"from"`
	Payload   any    `json:"payload"`
	Timestamp int64  `json:"timestamp"`
}

// HandleSignaling processes WebRTC signaling messages
func (c *Client) HandleSignaling(in ClientMessage) {
	ts := time.Now().Unix()

	// Relay signaling data to the partner via the Hub's broadcast
	// The Hub will ensure it reaches the partner even on another instance via Redis Backplane
	c.hub.BroadcastToRoom(c.RoomID, c.UserID, ServerMessage{
		Type:      in.Type,
		Payload:   in.Payload,
		Timestamp: ts,
	})
}
