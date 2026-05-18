"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Search, MessageSquare, Send } from "lucide-react";
import { clsx } from "clsx";
import { api } from "@/lib/api";
import { useChat } from "@/hooks/useChat";
import { usePartnerProfile } from "@/hooks/usePartnerProfile";
import { SkillTag } from "@/components/SkillTag";
import type {
  ExchangeRequest,
  MatchProfile,
  Room,
  UserStatus,
} from "@/types/index";

// ─── Helper ───────────────────────────────────────────────────────────────────

type TaggedRequest = ExchangeRequest & { direction: "incoming" | "outgoing" };
type ChatContact = {
  id: string;
  partner_user_id: string;
  room?: Room;
  request?: TaggedRequest;
};

function getRequestPartnerUserId(contact: TaggedRequest): string {
  return contact.direction === "incoming"
    ? contact.from_user_id
    : contact.to_user_id;
}

function getPartnerUserId(contact: ChatContact): string {
  return contact.partner_user_id;
}

function hasUserConfirmedComplete(
  request: ExchangeRequest | undefined,
  userId: string | null,
): boolean {
  if (!request || !userId) return false;
  if (request.from_user_id === userId) {
    return Boolean(request.sender_confirmed_complete);
  }
  if (request.to_user_id === userId) {
    return Boolean(request.recipient_confirmed_complete);
  }
  return false;
}

function getContactName(
  contact: ChatContact,
  profiles: Record<string, MatchProfile>,
): string {
  const request = contact.request;
  const embedded =
    request?.direction === "incoming"
      ? (request.sender ?? request.from_user_profile)
      : (request?.receiver ?? request?.to_user_profile);

  return embedded?.name ?? profiles[contact.partner_user_id]?.name ?? "Партнёр";
}
function buildChatContacts(
  requests: TaggedRequest[],
  rooms: Room[],
  myUserId?: string | null,
): ChatContact[] {
  const byPartner = new Map<string, ChatContact>();

  for (const request of requests) {
    const partnerId = getRequestPartnerUserId(request);
    if (!partnerId) continue;
    byPartner.set(partnerId, {
      id: `request:${request.id}`,
      partner_user_id: partnerId,
      request,
    });
  }

  for (const room of rooms) {
    const partnerId =
      myUserId && room.user_a === myUserId ? room.user_b : room.user_a;
    if (!partnerId) continue;
    const existing = byPartner.get(partnerId);
    byPartner.set(partnerId, {
      id: existing?.id ?? `room:${room.id}`,
      partner_user_id: partnerId,
      request: existing?.request,
      room,
    });
  }

  return Array.from(byPartner.values());
}

function normSkill(skill: string): string {
  return skill.toLowerCase().trim();
}

function skillMatch(a: string, b: string): boolean {
  const an = normSkill(a);
  const bn = normSkill(b);
  if (!an || !bn) return false;
  return an === bn || an.includes(bn) || bn.includes(an);
}

function pickFirstOverlap(
  primary: string[],
  secondary: string[],
): string | null {
  for (const p of primary) {
    for (const s of secondary) {
      if (skillMatch(p, s)) return p;
    }
  }
  return null;
}

function formatLastSeen(value?: string): string {
  if (!value) return "недавно";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "недавно";

  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (sameDay) return `был(а) сегодня в ${time}`;

  const day = date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
  });
  return `был(а) ${day} в ${time}`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ChatsPage() {
  const router = useRouter();

  const {
    roomId,
    messages,
    isPartnerTyping,
    partnerUserId,
    partnerOnline,
    partnerLastSeen,
    myMatchProfile,
    sendMessage,
    sendTyping,
    loadActiveRoom,
    connectToRoom,
    loadMyMatchProfile,
    subscribeToSocketEvent,
    unsubscribeFromSocketEvent,
    setMe,
    setUserId,
    userId,
    me,
  } = useChat();

  usePartnerProfile();

  const [acceptedRequests, setAcceptedRequests] = useState<TaggedRequest[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [contactFilter, setContactFilter] = useState("");
  const [activeContact, setActiveContact] = useState<ChatContact | null>(
    null,
  );
  const [profileById, setProfileById] = useState<Record<string, MatchProfile>>(
    {},
  );
  const loadedProfileIdsRef = useRef<Set<string>>(new Set());
  const [messageInput, setMessageInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [partnerStatus, setPartnerStatus] = useState<UserStatus | null>(null);
  const [completionNotice, setCompletionNotice] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Auth guard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("access_token")
        : null;
    if (!token) {
      router.push("/auth");
    }
  }, [router]);

  const loadPartnerProfiles = useCallback(async (items: ChatContact[]) => {
    const ids = new Set<string>();
    for (const req of items) ids.add(getPartnerUserId(req));

    const missing = Array.from(ids).filter(
      (id) => !loadedProfileIdsRef.current.has(id),
    );
    if (missing.length === 0) return;

    const results = await Promise.all(
      missing.map(async (id) => {
        try {
          const profile = await api.getMatchProfileById(id);
          return { id, profile };
        } catch {
          return null;
        }
      }),
    );

    setProfileById((prev) => {
      const next = { ...prev };
      for (const result of results) {
        if (!result?.profile) continue;
        next[result.id] = result.profile;
        loadedProfileIdsRef.current.add(result.id);
      }
      return next;
    });
  }, []);

  const loadMatchProfileById = useCallback(async (id: string) => {
    if (!id || loadedProfileIdsRef.current.has(id)) return;
    try {
      const profile = await api.getMatchProfileById(id);
      setProfileById((prev) => ({ ...prev, [id]: profile }));
      loadedProfileIdsRef.current.add(id);
    } catch {
      // ignore
    }
  }, []);

  // ── Load contacts on mount ────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [incoming, sent, allRooms, currentUser] = await Promise.all([
          api.getIncomingRequests(),
          api.getSentRequests(),
          api.getAllRooms().catch(() => [] as Room[]),
          api.getMe().catch(() => null),
        ]);
        if (currentUser) {
          setMe(currentUser);
          setUserId(currentUser.id);
        }
        const accepted: TaggedRequest[] = [
          ...(Array.isArray(incoming) ? incoming : [])
            .filter((r) => r.status === "accepted")
            .map((r) => ({ ...r, direction: "incoming" as const })),
          ...(Array.isArray(sent) ? sent : [])
            .filter((r) => r.status === "accepted")
            .map((r) => ({ ...r, direction: "outgoing" as const })),
        ];
        const roomList = Array.isArray(allRooms) ? allRooms : [];
        const chatContacts = buildChatContacts(
          accepted,
          roomList,
          currentUser?.id ?? userId ?? me?.id,
        );
        setAcceptedRequests(accepted);
        setRooms(roomList);
        void loadPartnerProfiles(chatContacts);
      } catch (err) {
        console.error("Failed to load chats:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [loadPartnerProfiles, me?.id, setMe, setUserId, userId]);

  // ── Load active room + my profile ──────────────────────────────────────────
  useEffect(() => {
    void loadActiveRoom({ force: true }).then((room) => {
      if (!room?.id) return;
      setRooms((prev) =>
        prev.some((item) => item.id === room.id) ? prev : [room, ...prev],
      );
    });
    void loadMyMatchProfile();
  }, [loadActiveRoom, loadMyMatchProfile]);

  // ── Load partner online/last seen status ────────────────────────────────────
  useEffect(() => {
    if (!partnerUserId) {
      setPartnerStatus(null);
      return;
    }

    api
      .getUserStatus(partnerUserId)
      .then((status) => setPartnerStatus(status))
      .catch(() => setPartnerStatus(null));
  }, [partnerUserId]);

  useEffect(() => {
    if (!partnerUserId) return;
    void loadMatchProfileById(partnerUserId);
  }, [partnerUserId, loadMatchProfileById]);

  // ── Auto-scroll to bottom ───────────────────────────────────────────────────
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isPartnerTyping]);

  // ── Subscribe to WebSocket events ────────────────────────────────────────────
  // This effect ensures real-time message delivery, typing indicators, and status updates
  useEffect(() => {
    if (!roomId) return;

    // Handler for incoming messages (already added to store via socket.handleMessage,
    // but we can add listeners for custom logic if needed in the future)
    const messageHandler = () => {
      // Messages are already added to store by socket.handleMessage
      // This is just a hook for potential future custom handling
    };

    // Handler for typing indicators
    const typingHandler = () => {
      // Already handled by socket.handleMessage updating isPartnerTyping
    };

    // Handler for status changes (online/offline)
    const statusHandler = () => {
      // Already handled by socket.handleMessage updating partnerOnline
      // But we subscribe to ensure the store is kept in sync
    };

    // Register event listeners to ensure they're active and can update store
    subscribeToSocketEvent("message", messageHandler);
    subscribeToSocketEvent("partner_typing", typingHandler);
    subscribeToSocketEvent("status_change", statusHandler);

    // Cleanup: unsubscribe when room changes or component unmounts
    return () => {
      unsubscribeFromSocketEvent("message", messageHandler);
      unsubscribeFromSocketEvent("partner_typing", typingHandler);
      unsubscribeFromSocketEvent("status_change", statusHandler);
    };
  }, [roomId, subscribeToSocketEvent, unsubscribeFromSocketEvent]);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const myUserId = userId ?? me?.id ?? null;
  const contacts = useMemo(
    () => buildChatContacts(acceptedRequests, rooms, myUserId),
    [acceptedRequests, rooms, myUserId],
  );
  const filteredContacts = contacts.filter((c) =>
    getContactName(c, profileById)
      .toLowerCase()
      .includes(contactFilter.toLowerCase()),
  );

  useEffect(() => {
    void loadPartnerProfiles(contacts);
  }, [contacts, loadPartnerProfiles]);

  useEffect(() => {
    if (!partnerUserId) return;
    const match = contacts.find(
      (contact) => getPartnerUserId(contact) === partnerUserId,
    );
    if (match) setActiveContact(match);
  }, [partnerUserId, contacts]);

  const activePartnerId =
    partnerUserId || (activeContact ? getPartnerUserId(activeContact) : "");
  const activeMatchProfile = activePartnerId
    ? profileById[activePartnerId]
    : null;
  const activeCompletionRequest = activeContact?.request;
  const isCompletionParticipant = Boolean(
    activeCompletionRequest &&
      myUserId &&
      (activeCompletionRequest.from_user_id === myUserId ||
        activeCompletionRequest.to_user_id === myUserId),
  );
  const hasConfirmedCompletion = hasUserConfirmedComplete(
    activeCompletionRequest,
    myUserId,
  );
  const canCompleteExchange =
    isCompletionParticipant &&
    Boolean(activeCompletionRequest?.id) &&
    activeCompletionRequest?.status !== "completed";

  // Use consistent single source for name: activeMatchProfile (from API) takes priority
  // This ensures the name displayed in sidebar and header are always the same
  const activeName =
    activeMatchProfile?.name ?? "Партнёр";

  const isOnline =
    typeof partnerStatus?.is_online === "boolean"
      ? partnerStatus.is_online
      : partnerOnline;
  
  // Use partnerLastSeen from socket state (real-time) as primary source
  // Fall back to partnerStatus.last_seen from API for initial load
  const lastSeenTimestamp = partnerLastSeen ?? partnerStatus?.last_seen;
  const statusText = isOnline
    ? "онлайн сейчас"
    : lastSeenTimestamp
      ? formatLastSeen(lastSeenTimestamp)
      : "не в сети";

  const myHave = myMatchProfile?.i_have ?? [];
  const myWant = myMatchProfile?.i_want ?? [];
  const partnerHave = activeMatchProfile?.i_have ?? [];
  const partnerWant = activeMatchProfile?.i_want ?? [];

  const teachSkill =
    pickFirstOverlap(myHave, partnerWant) ??
    myHave[0] ??
    partnerWant[0] ??
    null;
  const learnSkill =
    pickFirstOverlap(myWant, partnerHave) ??
    myWant[0] ??
    partnerHave[0] ??
    null;

  const hasActiveChat = Boolean(activePartnerId || activeContact);

  // ── Send handler (optimistic UI — no REST send endpoint) ────────────────────
  const handleSend = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const text = messageInput.trim();
      if (!text || !roomId) return;

      const sent = sendMessage(text);
      if (!sent) return;
      setMessageInput("");
      sendTyping(false);
    },
    [messageInput, roomId, sendMessage, sendTyping],
  );

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setMessageInput(value);
      if (roomId) sendTyping(value.length > 0);
    },
    [roomId, sendTyping],
  );

  // ── Render ───────────────────────────────────────────────────────────────────
  const applyUpdatedRequest = useCallback((updated: ExchangeRequest) => {
    setAcceptedRequests((prev) =>
      prev.map((request) =>
        request.id === updated.id
          ? { ...request, ...updated, direction: request.direction }
          : request,
      ),
    );
    setActiveContact((prev) => {
      if (prev?.request?.id !== updated.id) return prev;
      return {
        ...prev,
        request: {
          ...prev.request,
          ...updated,
          direction: prev.request.direction,
        },
      };
    });
  }, []);

  const completeExchangeMutation = useMutation<
    ExchangeRequest,
    Error,
    string,
    {
      previousRequests: TaggedRequest[];
      previousActiveContact: ChatContact | null;
    }
  >({
    mutationFn: (requestId) => api.completeRequest(requestId),
    onMutate: (requestId) => {
      const previousRequests = acceptedRequests;
      const previousActiveContact = activeContact;

      setAcceptedRequests((prev) =>
        prev.map((request) => {
          if (request.id !== requestId) return request;
          return {
            ...request,
            sender_confirmed_complete:
              request.from_user_id === myUserId
                ? true
                : request.sender_confirmed_complete,
            recipient_confirmed_complete:
              request.to_user_id === myUserId
                ? true
                : request.recipient_confirmed_complete,
          };
        }),
      );
      setActiveContact((prev) => {
        if (prev?.request?.id !== requestId) return prev;
        return {
          ...prev,
          request: {
            ...prev.request,
            sender_confirmed_complete:
              prev.request.from_user_id === myUserId
                ? true
                : prev.request.sender_confirmed_complete,
            recipient_confirmed_complete:
              prev.request.to_user_id === myUserId
                ? true
                : prev.request.recipient_confirmed_complete,
          },
        };
      });

      return { previousRequests, previousActiveContact };
    },
    onError: (error, _requestId, context) => {
      if (context) {
        setAcceptedRequests(context.previousRequests);
        setActiveContact(context.previousActiveContact);
      }
      setCompletionNotice(
        error.message || "Не удалось завершить обмен. Попробуйте ещё раз.",
      );
    },
    onSuccess: (updated) => {
      applyUpdatedRequest(updated);
      if (updated.status === "completed") {
        setCompletionNotice("Обмен успешно завершён! Баллы уже начислены.");
        window.setTimeout(() => router.push("/dashboard"), 1400);
        return;
      }
      setCompletionNotice("Подтверждение сохранено. Ждём второго участника.");
    },
  });

  const handleCompleteExchange = useCallback(() => {
    if (!activeCompletionRequest?.id || hasConfirmedCompletion) return;
    completeExchangeMutation.mutate(activeCompletionRequest.id);
  }, [
    activeCompletionRequest?.id,
    completeExchangeMutation,
    hasConfirmedCompletion,
  ]);

  const completionButtonLabel =
    activeCompletionRequest?.status === "completed"
      ? "Обмен завершён"
      : completeExchangeMutation.isPending
        ? "Отправляем..."
        : hasConfirmedCompletion
          ? "Ожидание подтверждения..."
          : "Завершить обмен";

  return (
    <div className="flex h-full">
      {completionNotice && (
        <div className="fixed right-5 top-5 z-50 max-w-sm rounded-xl border border-white/10 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 shadow-2xl shadow-black/40">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
            <div className="min-w-0">
              <p className="font-semibold">Завершить обмен</p>
              <p className="mt-1 text-zinc-400">{completionNotice}</p>
            </div>
            <button
              type="button"
              onClick={() => setCompletionNotice(null)}
              className="ml-2 text-zinc-500 transition-colors hover:text-zinc-200"
              aria-label="Закрыть"
            >
              ×
            </button>
          </div>
        </div>
      )}
      {/* ── Left Pane: Contacts ─────────────────────────────────────────────── */}
      <div className="w-72 shrink-0 border-r border-white/5 flex flex-col bg-zinc-900/40">
        {/* Header + search */}
        <div className="p-4 border-b border-white/5">
          <h2 className="font-semibold text-zinc-100 mb-3">Чаты</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
            <input
              type="text"
              value={contactFilter}
              onChange={(e) => setContactFilter(e.target.value)}
              placeholder="Поиск контакта..."
              className="rounded-xl border border-white/5 bg-zinc-800/70 pl-9 pr-4 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 w-full focus:border-blue-500/60 focus:outline-none"
            />
          </div>
        </div>

        {/* Contact list */}
        <div className="flex-1 overflow-y-auto p-2">
          {loading && (
            <div className="flex items-center justify-center h-24">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loading &&
            filteredContacts.map((contact) => {
              const name = getContactName(contact, profileById);
              const isActive = activePartnerId
                ? getPartnerUserId(contact) === activePartnerId
                : activeContact?.id === contact.id;
              return (
                <button
                  key={contact.id}
                  onClick={() => {
                    setActiveContact(contact);
                    if (contact.room) {
                      connectToRoom(contact.room, { force: true });
                    } else {
                      void loadActiveRoom({ force: true });
                    }
                  }}
                  className={clsx(
                    "w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-colors",
                    isActive
                      ? "bg-blue-600/15 border border-blue-600/20"
                      : "hover:bg-white/5",
                  )}
                >
                  <div className="relative w-9 h-9 rounded-full bg-zinc-700 flex items-center justify-center text-zinc-300 text-sm font-bold shrink-0">
                    {name[0]?.toUpperCase() ?? "?"}
                    {isActive && (
                      <span
                        className={clsx(
                          "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-zinc-900",
                          isOnline ? "bg-emerald-500" : "bg-zinc-600",
                        )}
                      />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-100 truncate">
                      {name}
                    </p>
                    <p className="text-xs text-zinc-500 truncate">
                      Активный обмен
                    </p>
                  </div>
                </button>
              );
            })}

          {/* Empty state */}
          {!loading && contacts.length === 0 && (
            <div className="flex flex-col items-center justify-center h-40 text-center px-4">
              <MessageSquare className="w-8 h-8 text-zinc-600 mb-2" />
              <p className="text-sm text-zinc-500">Нет активных чатов</p>
              <p className="text-xs text-zinc-600 mt-1">
                Примите запрос на обмен, чтобы начать
              </p>
            </div>
          )}

          {/* Filtered but list non-empty — no results */}
          {!loading && contacts.length > 0 && filteredContacts.length === 0 && (
            <div className="flex flex-col items-center justify-center h-32 text-center px-4">
              <p className="text-sm text-zinc-500">Контакты не найдены</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Right Pane: Chat Window ──────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {hasActiveChat ? (
          <>
            {/* Chat header */}
            <div className="px-5 py-4 border-b border-white/5 flex items-center gap-3 shrink-0">
              <div className="relative w-9 h-9 rounded-full bg-zinc-700 flex items-center justify-center text-zinc-300 font-bold shrink-0">
                {activeName[0]?.toUpperCase() ?? "?"}
                <span
                  className={clsx(
                    "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-zinc-900",
                    isOnline ? "bg-emerald-500" : "bg-zinc-600",
                  )}
                />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-zinc-100 truncate">
                    {activeName}
                  </h3>
                  {teachSkill && (
                    <span title="Вы учите">
                      <SkillTag skill={teachSkill} variant="teach" />
                    </span>
                  )}
                  {teachSkill && learnSkill && (
                    <span className="text-xs text-zinc-500">↔</span>
                  )}
                  {learnSkill && (
                    <span title="Вы учитесь">
                      <SkillTag skill={learnSkill} variant="learn" />
                    </span>
                  )}
                </div>
                <p
                  className={clsx(
                    "text-xs",
                    isOnline ? "text-emerald-400" : "text-zinc-500",
                  )}
                >
                  {isPartnerTyping
                    ? "печатает..."
                    : roomId
                      ? statusText
                      : "нет активной комнаты"}
                </p>
              </div>
              {activeCompletionRequest && isCompletionParticipant && (
                <button
                  type="button"
                  onClick={handleCompleteExchange}
                  disabled={
                    !canCompleteExchange ||
                    hasConfirmedCompletion ||
                    completeExchangeMutation.isPending
                  }
                  className={clsx(
                    "ml-auto inline-flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors",
                    activeCompletionRequest.status === "completed"
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                      : hasConfirmedCompletion
                        ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                        : "border-blue-500/30 bg-blue-600 text-white hover:bg-blue-500",
                    (!canCompleteExchange ||
                      hasConfirmedCompletion ||
                      completeExchangeMutation.isPending) &&
                      "cursor-not-allowed opacity-80",
                  )}
                >
                  {completeExchangeMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  <span className="max-w-[12rem] truncate">
                    {completionButtonLabel}
                  </span>
                </button>
              )}
            </div>

            {/* Messages area */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-5 space-y-3"
            >
              {messages.map((msg, i) => {
                const isMe = msg.sender === "me";
                return (
                  <div
                    key={msg.id ?? i}
                    className={clsx(
                      "flex",
                      isMe ? "justify-end" : "justify-start",
                    )}
                  >
                    <div
                      className={clsx(
                        "max-w-[70%] min-w-0 rounded-2xl px-4 py-2.5 text-sm leading-relaxed break-words",
                        isMe
                          ? "bg-blue-600 text-white rounded-br-md"
                          : "bg-zinc-800 text-zinc-100 rounded-bl-md",
                      )}
                    >
                      <p>{msg.content}</p>
                      <span
                        className={clsx(
                          "block text-[10px] mt-1 opacity-50",
                          isMe ? "text-right" : "text-left",
                        )}
                      >
                        {new Date(
                          msg.timestamp < 1e12
                            ? msg.timestamp * 1000
                            : msg.timestamp,
                        ).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>
                );
              })}

              {isPartnerTyping && roomId && (
                <div className="flex justify-start">
                  <div className="max-w-[70%] min-w-0 rounded-2xl px-4 py-2.5 text-sm leading-relaxed bg-zinc-800 text-zinc-100 rounded-bl-md">
                    <div className="flex gap-1.5">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500 [animation-delay:0.2s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500 [animation-delay:0.4s]" />
                    </div>
                  </div>
                </div>
              )}

              {/* Empty messages, room exists */}
              {messages.length === 0 && roomId && !isPartnerTyping && (
                <div className="flex flex-col items-center justify-center h-full text-center gap-2 py-16">
                  <MessageSquare className="w-10 h-10 text-zinc-700" />
                  <p className="text-zinc-500 text-sm">Начните общение!</p>
                </div>
              )}

              {/* No room */}
              {!roomId && (
                <div className="flex items-center justify-center h-full">
                  <p className="text-zinc-600 text-sm">Комната не найдена</p>
                </div>
              )}
            </div>

            {/* Message input */}
            <form
              onSubmit={handleSend}
              className="p-4 border-t border-white/5 shrink-0"
            >
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={messageInput}
                  onChange={handleInputChange}
                  onBlur={() => sendTyping(false)}
                  placeholder={
                    roomId ? "Напишите сообщение..." : "Комната недоступна"
                  }
                  disabled={!roomId}
                  className="flex-1 rounded-xl border border-white/5 bg-zinc-800/70 px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500/60 focus:outline-none disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!roomId || !messageInput.trim()}
                  className="p-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 transition-colors"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </form>
          </>
        ) : (
          /* No contact selected */
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
            <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-white/5 flex items-center justify-center">
              <MessageSquare className="w-7 h-7 text-zinc-600" />
            </div>
            <h3 className="font-semibold text-zinc-300">Выберите чат</h3>
            <p className="text-sm text-zinc-500 max-w-xs">
              Выберите контакт слева, чтобы открыть историю переписки
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
