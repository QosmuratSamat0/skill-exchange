import { useEffect, useCallback, useRef } from "react";
import { useChatStore } from "@/store/chatStore";
import { chatSocket } from "@/lib/socket";
import { api, getAccessToken } from "@/lib/api";
import type { ExchangeRequest, MatchNotification, Room } from "@/types/index";

function decodeUserIdFromAccessToken(token: string | null): string | null {
  if (!token || typeof window === "undefined") return null;
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(window.atob(normalized));
    return typeof decoded.sub === "string" ? decoded.sub : null;
  } catch {
    return null;
  }
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

export function useChat() {
  const store = useChatStore();

  /**
   * Track the room ID we've already connected to so the SSE handler doesn't
   * open a duplicate WebSocket when the same `request_accepted` event fires
   * more than once.
   */
  const connectedRoomRef = useRef<string | null>(null);
  const hasReportedSseErrorRef = useRef(false);

  const loadRoomMessages = useCallback(async (roomId: string) => {
    try {
      const messages = await api.getRoomMessages(roomId);
      if ((messages ?? []).length > 0) {
        useChatStore.getState().setMessages(messages ?? []);
      }
      return messages ?? [];
    } catch (err) {
      console.error("[useChat] Failed to load room messages", err);
      return [];
    }
  }, []);

  const shouldAutoConnectToAcceptedRoom = useCallback(() => {
    const chatState = useChatStore.getState();
    return (
      !chatState.roomId &&
      chatState.status !== "chatting" &&
      chatState.status !== "ended" &&
      chatState.endReason !== "next"
    );
  }, []);

  const connectToRoom = useCallback((room: Room, options?: { force?: boolean }) => {
    if (!room?.id) return;
    if (!options?.force && !shouldAutoConnectToAcceptedRoom()) return;
    if (connectedRoomRef.current === room.id) return;
    connectedRoomRef.current = room.id;

    const chatState = useChatStore.getState();
    const freshToken = getAccessToken() ?? "";
    const myUserId =
      chatState.userId ??
      chatState.me?.id ??
      decodeUserIdFromAccessToken(freshToken);
    const isInitiator = myUserId ? room.user_a === myUserId : false;

    if (myUserId && !chatState.userId) {
      chatState.setUserId(myUserId);
    }

    chatState.setMatchData({
      roomId: room.id,
      mode: "text",
      isInitiator,
      partnerGender: "unknown",
      partnerUserId: isInitiator ? room.user_b : room.user_a,
    });

    chatSocket.connect(room.id, freshToken);
    void loadRoomMessages(room.id);
  }, [loadRoomMessages, shouldAutoConnectToAcceptedRoom]);

  const loadActiveRoom = useCallback(async (options?: { force?: boolean }) => {
    if (!options?.force && !shouldAutoConnectToAcceptedRoom()) return null;

    try {
      const room = await api.getMyRoom();
      if (room?.id) {
        connectToRoom(room, options);
        return room;
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes("404")) return null;
      console.error("[useChat] Failed to load active room", err);
    }
    return null;
  }, [connectToRoom, shouldAutoConnectToAcceptedRoom]);

  // ── Data fetchers ────────────────────────────────────────────────────────────

  const refreshCandidates = useCallback(async () => {
    try {
      const candidates = await api.getCandidates();
      useChatStore.getState().setCandidates(candidates ?? []);
    } catch (err) {
      console.error("[useChat] Failed to fetch candidates", err);
    }
  }, []);

  const refreshIncomingRequests = useCallback(async () => {
    try {
      const requests = await api.getIncomingRequests();
      useChatStore.getState().setIncomingRequests(requests ?? []);
      if (
        (requests ?? []).some((request) => request.status === "accepted") &&
        shouldAutoConnectToAcceptedRoom()
      ) {
        void loadActiveRoom();
      }
    } catch (err) {
      console.error("[useChat] Failed to fetch incoming requests", err);
    }
  }, [loadActiveRoom, shouldAutoConnectToAcceptedRoom]);

  const refreshSentRequests = useCallback(async () => {
    try {
      const requests = await api.getSentRequests();
      useChatStore.getState().setSentRequests(requests ?? []);
      if (
        (requests ?? []).some((request) => request.status === "accepted") &&
        shouldAutoConnectToAcceptedRoom()
      ) {
        void loadActiveRoom();
      }
    } catch (err) {
      console.error("[useChat] Failed to fetch sent requests", err);
    }
  }, [loadActiveRoom, shouldAutoConnectToAcceptedRoom]);

  const loadMyMatchProfile = useCallback(async () => {
    try {
      const profile = await api.getMatchProfile();
      useChatStore.getState().setMyMatchProfile(profile); // already accepts null
    } catch (err) {
      console.error("[useChat] Failed to load match profile", err);
    }
  }, []);

  const loadMyStats = useCallback(async () => {
    try {
      const stats = await api.getMyStats();
      useChatStore.getState().setMyStats(stats);
    } catch (err) {
      console.error("[useChat] Failed to load stats", err);
    }
  }, []);

  // ── Request actions ──────────────────────────────────────────────────────────

  const sendRequest = useCallback(
    async (userId: string) => {
      try {
        await api.sendExchangeRequest(userId);
        // Optimistically refresh sent requests
        refreshSentRequests();
      } catch (err) {
        console.error("[useChat] Failed to send request", err);
      }
    },
    [refreshSentRequests],
  );

  const acceptRequest = useCallback(
    async (reqId: string) => {
      try {
        await api.acceptRequest(reqId);
        // After accepting the server will emit a `request_accepted` SSE event
        // that carries the Room payload — let the SSE handler drive the transition.
        await refreshIncomingRequests();
        await loadActiveRoom({ force: true });
      } catch (err) {
        console.error("[useChat] Failed to accept request", err);
      }
    },
    [refreshIncomingRequests, loadActiveRoom],
  );

  const declineRequest = useCallback(
    async (reqId: string) => {
      try {
        await api.declineRequest(reqId);
        await refreshIncomingRequests();
      } catch (err) {
        console.error("[useChat] Failed to decline request", err);
      }
    },
    [refreshIncomingRequests],
  );

  const cancelRequest = useCallback(
    async (reqId: string) => {
      try {
        await api.cancelRequest(reqId);
        await refreshSentRequests();
      } catch (err) {
        if (err instanceof Error && err.message.includes("409 Conflict")) {
          await refreshSentRequests();
          await loadActiveRoom();
          return;
        }
        console.error("[useChat] Failed to cancel request", err);
      }
    },
    [refreshSentRequests, loadActiveRoom],
  );

  // ── SSE — real-time notifications ────────────────────────────────────────────

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;

    const sseUrl = api.getNotificationsSSEUrl(token);
    const es = new EventSource(sseUrl);

    es.onmessage = (event: MessageEvent) => {
      let data: MatchNotification;
      try {
        data = JSON.parse(event.data as string) as MatchNotification;
      } catch (err) {
        console.error("[useChat] SSE parse error", err);
        return;
      }

      switch (data.type) {
        case "request_received": {
          // Someone sent us a request — refresh the inbox
          void refreshIncomingRequests();
          break;
        }

        case "request_accepted": {
          // Our outgoing request was accepted — the payload is the Room
          const room = data.payload as Room;
          connectToRoom(room, { force: true });
          break;
        }

        case "request_declined": {
          void refreshIncomingRequests();
          void refreshSentRequests();
          break;
        }

        case "request_cancelled": {
          void refreshIncomingRequests();
          break;
        }

        case "exchange_completion_triggered":
        case "exchange_completed": {
          const request = data.payload as ExchangeRequest | undefined;
          if (request?.id) {
            useChatStore.getState().upsertExchangeRequest(request);
            window.dispatchEvent(
              new CustomEvent("pairexx:exchange:updated", {
                detail: request,
              }),
            );
          }
          void refreshIncomingRequests();
          void refreshSentRequests();
          break;
        }

        default:
          break;
      }
    };

    es.onerror = () => {
      if (hasReportedSseErrorRef.current) return;
      hasReportedSseErrorRef.current = true;
      console.warn(
        "[useChat] Notification stream disconnected; EventSource will retry automatically.",
      );
    };

    return () => {
      es.close();
    };
  }, [
    // Re-subscribe only when the token identity changes (i.e. after login/logout).
    // Stable callbacks are fine as deps; store reference is intentionally excluded.
    refreshIncomingRequests,
    refreshSentRequests,
    connectToRoom,
  ]);

  // ── Public API ───────────────────────────────────────────────────────────────

  return {
    // ── Store state (spread for convenient destructuring at call site) ─────────
    ...store,

    // ── Data actions ───────────────────────────────────────────────────────────
    refreshCandidates,
    refreshIncomingRequests,
    refreshSentRequests,
    loadMyMatchProfile,
    loadMyStats,
    loadActiveRoom,
    connectToRoom,

    // ── Request actions ────────────────────────────────────────────────────────
    sendRequest,
    acceptRequest,
    declineRequest,
    cancelRequest,

    // ── Socket actions ─────────────────────────────────────────────────────────
    sendMessage: chatSocket.send.bind(chatSocket),
    sendTyping: chatSocket.sendTyping.bind(chatSocket),
    next: chatSocket.next.bind(chatSocket),
    subscribeToSocketEvent: chatSocket.onMessage.bind(chatSocket),
    unsubscribeFromSocketEvent: chatSocket.offMessage.bind(chatSocket),
  };
}
