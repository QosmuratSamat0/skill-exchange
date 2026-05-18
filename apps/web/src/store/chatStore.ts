import { create } from "zustand";
import type {
  ChatStatus,
  Message,
  User,
  UserProfile,
  MatchProfile,
  MatchStats,
  ExchangeRequest,
} from "@/types/index";

// ─── Store shape ──────────────────────────────────────────────────────────────

interface ChatStore {
  // ── Session state ───────────────────────────────────────────────────────────
  status: ChatStatus;
  roomId: string | null;
  messages: Message[];
  isPartnerTyping: boolean;
  endReason: "next" | "disconnect" | "ban" | null;
  mode: "text" | "voice" | null;
  isInitiator: boolean;
  partnerUserId: string;
  /** Partner's user profile (name, avatar, bio, teach_skills, learn_skills) */
  partnerProfile: UserProfile | null;
  /** Whether the partner is currently online */
  partnerOnline: boolean;
  /** Partner's last seen timestamp (ISO string or null if online/unknown) */
  partnerLastSeen: string | null;

  // ── Auth state ──────────────────────────────────────────────────────────────
  accessToken: string | null;
  userId: string | null; // decoded from JWT or from getMe response

  // ── User data ───────────────────────────────────────────────────────────────
  me: User | null;
  /** user-service profile — name, avatar, bio, teach_skills, learn_skills */
  myUserProfile: UserProfile | null;
  /** matchmaking profile — i_have, i_want */
  myMatchProfile: MatchProfile | null;
  myStats: MatchStats | null;

  // ── Discovery state ─────────────────────────────────────────────────────────
  candidates: MatchProfile[];
  incomingRequests: ExchangeRequest[];
  sentRequests: ExchangeRequest[];

  // ── UI / misc ───────────────────────────────────────────────────────────────
  autoSearchOnReturn: boolean;
  partnerGender: string;
  unreadChatCount: number;
  pendingNotificationsCount: number;

  // ── Actions ─────────────────────────────────────────────────────────────────

  setStatus: (status: ChatStatus) => void;
  setRoomId: (roomId: string | null) => void;
  setMode: (mode: "text" | "voice" | null) => void;
  setIsInitiator: (isInitiator: boolean) => void;
  setPartnerUserId: (userId: string) => void;
  setPartnerGender: (gender: string) => void;
  setPartnerProfile: (profile: UserProfile | null) => void;
  setPartnerOnline: (online: boolean) => void;
  setPartnerLastSeen: (lastSeen: string | null) => void;
  setAutoSearchOnReturn: (enabled: boolean) => void;
  setUnreadChatCount: (count: number) => void;
  incrementUnreadChatCount: () => void;
  setPendingNotificationsCount: (count: number) => void;

  setAccessToken: (token: string | null) => void;
  setUserId: (id: string | null) => void;
  setMe: (user: User | null) => void;
  setMyUserProfile: (profile: UserProfile | null) => void;
  setMyMatchProfile: (profile: MatchProfile | null) => void;
  setMyStats: (stats: MatchStats | null) => void;

  setCandidates: (candidates: MatchProfile[]) => void;
  setIncomingRequests: (requests: ExchangeRequest[]) => void;
  setSentRequests: (requests: ExchangeRequest[]) => void;
  upsertExchangeRequest: (request: ExchangeRequest) => void;

  addMessage: (message: Message) => void;
  setMessages: (messages: Message[]) => void;
  setPartnerTyping: (isTyping: boolean) => void;
  setEndReason: (reason: "next" | "disconnect" | "ban" | null) => void;

  setMatchData: (data: {
    roomId: string;
    mode: "text" | "voice";
    isInitiator: boolean;
    partnerGender: string;
    partnerUserId?: string;
  }) => void;

  /**
   * Clear session state (roomId, messages, mode, etc.) while keeping
   * user/profile data and auth tokens.
   */
  resetSession: () => void;

  /** Clear everything including auth. */
  reset: () => void;
}

// ─── Initial values ───────────────────────────────────────────────────────────

const SESSION_DEFAULTS = {
  status: "idle" as ChatStatus,
  roomId: null,
  messages: [] as Message[],
  isPartnerTyping: false,
  endReason: null,
  mode: null,
  isInitiator: false,
  partnerUserId: "",
  partnerGender: "",
  partnerProfile: null,
  partnerOnline: false,
  partnerLastSeen: null,
} as const;

function getRoomMessages(roomId: string | null): Message[] {
  if (!roomId || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(`pairexx:chat:${roomId}:messages`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Message[]) : [];
  } catch {
    return [];
  }
}

function saveRoomMessages(roomId: string | null, messages: Message[]) {
  if (!roomId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      `pairexx:chat:${roomId}:messages`,
      JSON.stringify(messages.slice(-200)),
    );
  } catch {
    // localStorage can be unavailable in private contexts.
  }
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useChatStore = create<ChatStore>()((set, get) => ({
  // Session
  ...SESSION_DEFAULTS,

  // Auth
  accessToken: null,
  userId: null,

  // User data
  me: null,
  myUserProfile: null,
  myMatchProfile: null,
  myStats: null,

  // Discovery
  candidates: [],
  incomingRequests: [],
  sentRequests: [],

  // UI
  autoSearchOnReturn: false,
  partnerProfile: null,
  partnerOnline: false,
  unreadChatCount: 0,
  pendingNotificationsCount: 0,

  // ── Session setters ─────────────────────────────────────────────────────────
  setStatus: (status) => set({ status }),
  setRoomId: (roomId) => set({ roomId }),
  setMode: (mode) => set({ mode }),
  setIsInitiator: (isInitiator) => set({ isInitiator }),
  setPartnerUserId: (partnerUserId) => set({ partnerUserId }),
  setPartnerGender: (partnerGender) => set({ partnerGender }),
  setPartnerProfile: (partnerProfile) => set({ partnerProfile }),
  setPartnerOnline: (partnerOnline) => set({ partnerOnline }),
  setPartnerLastSeen: (partnerLastSeen) => set({ partnerLastSeen }),
  setAutoSearchOnReturn: (autoSearchOnReturn) => set({ autoSearchOnReturn }),
  setUnreadChatCount: (unreadChatCount) =>
    set({ unreadChatCount: Math.max(0, unreadChatCount) }),
  incrementUnreadChatCount: () =>
    set((state) => ({ unreadChatCount: state.unreadChatCount + 1 })),
  setPendingNotificationsCount: (pendingNotificationsCount) =>
    set({ pendingNotificationsCount: Math.max(0, pendingNotificationsCount) }),

  // ── Auth setters ────────────────────────────────────────────────────────────
  setAccessToken: (accessToken) => set({ accessToken }),
  setUserId: (userId) => set({ userId }),

  // ── Profile setters ─────────────────────────────────────────────────────────
  setMe: (me) => set({ me }),
  setMyUserProfile: (myUserProfile) => set({ myUserProfile }),
  setMyMatchProfile: (myMatchProfile) => set({ myMatchProfile }),
  setMyStats: (myStats) => set({ myStats }),

  // ── Discovery setters ───────────────────────────────────────────────────────
  setCandidates: (candidates) => set({ candidates }),
  setIncomingRequests: (incomingRequests) => set({ incomingRequests }),
  setSentRequests: (sentRequests) => set({ sentRequests }),
  upsertExchangeRequest: (request) =>
    set((state) => {
      const patch = (items: ExchangeRequest[]) =>
        items.map((item) =>
          item.id === request.id ? { ...item, ...request } : item,
        );

      return {
        incomingRequests: patch(state.incomingRequests),
        sentRequests: patch(state.sentRequests),
      };
    }),

  // ── Message / chat setters ──────────────────────────────────────────────────
  addMessage: (message) =>
    set((state) => {
      const messages = [...state.messages, message];
      saveRoomMessages(state.roomId, messages);
      return { messages };
    }),

  setMessages: (messages) => {
    saveRoomMessages(get().roomId, messages);
    set({ messages });
  },

  setPartnerTyping: (isPartnerTyping) => set({ isPartnerTyping }),

  setEndReason: (endReason) => set({ endReason }),

  setMatchData: (data) =>
    set({
      status: "matched",
      roomId: data.roomId,
      mode: data.mode,
      isInitiator: data.isInitiator,
      partnerGender: data.partnerGender,
      partnerUserId: data.partnerUserId ?? "",
      messages: getRoomMessages(data.roomId),
      isPartnerTyping: false,
      endReason: null,
      partnerProfile: null,
      partnerOnline: false,
      partnerLastSeen: null,
    }),

  // ── Compound actions ────────────────────────────────────────────────────────
  resetSession: () =>
    set((state) => ({
      ...SESSION_DEFAULTS,
      // Preserve non-session state
      accessToken: state.accessToken,
      userId: state.userId,
      me: state.me,
      myUserProfile: state.myUserProfile,
      myMatchProfile: state.myMatchProfile,
      myStats: state.myStats,
      candidates: state.candidates,
      incomingRequests: state.incomingRequests,
      sentRequests: state.sentRequests,
      autoSearchOnReturn: state.autoSearchOnReturn,
      unreadChatCount: state.unreadChatCount,
      pendingNotificationsCount: state.pendingNotificationsCount,
      partnerProfile: null,
      partnerOnline: false,
      partnerLastSeen: null,
    })),

  reset: () =>
    set({
      ...SESSION_DEFAULTS,
      accessToken: null,
      userId: null,
      me: null,
      myUserProfile: null,
      myMatchProfile: null,
      myStats: null,
      candidates: [],
      incomingRequests: [],
      sentRequests: [],
      autoSearchOnReturn: false,
      unreadChatCount: 0,
      pendingNotificationsCount: 0,
    }),
}));
