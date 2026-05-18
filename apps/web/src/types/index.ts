// ─── Chat / Session types ────────────────────────────────────────────────────

export type ChatStatus =
  | "idle"
  | "searching"
  | "matched"
  | "chatting"
  | "calling"
  | "ended";

export interface Message {
  id: string;
  sender: string; // 'me' | 'partner'
  content: string;
  timestamp: number;
}

export interface ServerMessage {
  type:
    | "status"
    | "typing"
    | "partner_connected"
    | "message"
    | "partner_disconnected"
    | "partner_typing"
    | "status_change"
    | "match_found"
    | "error"
    | "rtc:offer"
    | "rtc:answer"
    | "rtc:ice-candidate"
    | "call:start"
    | "call:end"
    | "pong";
  room_id?: string;
  content?: string;
  sender?: string;
  user_id?: string;
  status?: "online" | "offline";
  is_typing?: boolean;
  is_online?: boolean;
  timestamp?: number;
  ts?: number;
  payload?: unknown;
  mode?: "text" | "voice";
}

export type ChatState = {
  status: ChatStatus;
  roomId: string | null;
  messages: Message[];
  isPartnerTyping: boolean;
  endReason: "next" | "disconnect" | "ban" | null;
};

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
}

// ─── User service types ───────────────────────────────────────────────────────

export interface User {
  id: string;
  device_id?: string;
  email?: string;
  gender: string;
  interests: string[];
  is_anonymous: boolean;
  created_at: string;
}

export interface UserProfile {
  user_id: string;
  name: string;
  avatar: string;
  bio: string;
  contact_number: string; // phone / WhatsApp / Telegram
  teach_skills: string[];
  learn_skills: string[];
  rating: number;
  review_count: number;
  email_notifications_enabled?: boolean;
  updated_at: string;
}

export interface Review {
  id: string;
  from_user_id: string;
  to_user_id: string;
  rating: number;
  comment: string;
  created_at: string;
}

export interface UserSession {
  id: string;
  user_id: string;
  user_agent: string;
  ip: string;
  created_at: string;
  expires_at: string;
}

export interface Ban {
  id: string;
  user_id: string;
  reason: string;
  banned_by: string;
  expires_at: string;
  created_at: string;
}

// ─── Matchmaking types ────────────────────────────────────────────────────────

export interface MatchProfile {
  user_id: string;
  name: string;
  i_have: string[]; // skills I can teach
  i_want: string[]; // skills I want to learn
  bio: string;
  updated_at: string;
  /** Optional — populated when the backend includes aggregated rating data */
  rating?: number;
}

export interface ExchangeRequest {
  id: string;
  from_user_id: string;
  to_user_id: string;
  status: "pending" | "accepted" | "declined" | "cancelled" | "completed";
  sender_confirmed_complete?: boolean;
  recipient_confirmed_complete?: boolean;
  created_at: string;
  completed_at?: string;
  sender?: MatchProfile;
  receiver?: MatchProfile;
  from_user_profile?: MatchProfile;
  to_user_profile?: MatchProfile;
}

export interface Room {
  id: string;
  user_a: string;
  user_b: string;
  created_at: string;
}

export interface UserStatus {
  user_id: string;
  is_online: boolean;
  last_seen: string;
  is_searching: boolean;
}

export interface MatchStats {
  user_id: string;
  total_matches: number;
  accepted_count: number;
  declined_count: number;
  rating: number;
  updated_at: string;
}

export interface MatchNotification {
  type:
    | "request_received"
    | "request_accepted"
    | "request_declined"
    | "request_cancelled"
    | "exchange_completion_triggered"
    | "exchange_completed";
  payload: ExchangeRequest | Room | unknown;
}

export interface InAppNotification {
  id: string;
  user_id: string;
  type: "exchange_completion_triggered" | "exchange_completed" | string;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
  read_at?: string | null;
  created_at: string;
}
