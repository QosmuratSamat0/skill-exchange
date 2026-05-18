package ws

type ClientMessage struct {
	Type     string      `json:"type"`
	Content  string      `json:"content,omitempty"`
	IsTyping bool        `json:"is_typing,omitempty"`
	Reason   string      `json:"reason,omitempty"`
	Payload  interface{} `json:"payload,omitempty"`
}

type ServerMessage struct {
	Type      string      `json:"type"`
	Content   string      `json:"content,omitempty"`
	Sender    string      `json:"sender,omitempty"`
	UserID    string      `json:"user_id,omitempty"`
	Status    string      `json:"status,omitempty"`
	IsTyping  bool        `json:"is_typing,omitempty"`
	IsOnline  *bool       `json:"is_online,omitempty"`
	RoomID    string      `json:"room_id,omitempty"`
	Timestamp int64       `json:"ts,omitempty"`
	Payload   interface{} `json:"payload,omitempty"`

	Code    string `json:"code,omitempty"`
	Message string `json:"message,omitempty"`
}

// NatsMessage wraps a server message for NATS publication
// Used for cross-instance message delivery
type NatsMessage struct {
	RoomID           string        `json:"room_id"`
	OriginalSenderID string        `json:"original_sender_id"`
	Payload          ServerMessage `json:"payload"`
}
