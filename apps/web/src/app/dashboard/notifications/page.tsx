"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check, X, Clock, Users, MessageCircle } from "lucide-react";
import { clsx } from "clsx";
import { api } from "@/lib/api";
import { useChatStore } from "@/store/chatStore";
import type {
  ExchangeRequest,
  InAppNotification,
  MatchProfile,
} from "@/types/index";

// ─── Types ────────────────────────────────────────────────────────────────────

type ActiveTab = "all" | "requests" | "accepted" | "rejected";

type TaggedRequest = ExchangeRequest & { direction: "incoming" | "outgoing" };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPartnerUserId(contact: TaggedRequest): string {
  return contact.direction === "incoming"
    ? contact.from_user_id
    : contact.to_user_id;
}

function getContactName(
  contact: TaggedRequest,
  profiles: Record<string, MatchProfile>,
): string {
  const embedded =
    contact.direction === "incoming"
      ? (contact.sender ?? contact.from_user_profile)
      : (contact.receiver ?? contact.to_user_profile);

  return (
    embedded?.name ?? profiles[getPartnerUserId(contact)]?.name ?? "Партнёр"
  );
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

const TAB_LABELS: Record<ActiveTab, string> = {
  all: "Все",
  requests: "Запросы",
  accepted: "Принятые",
  rejected: "Отклонённые",
};

const EMPTY_MESSAGES: Record<ActiveTab, string> = {
  all: "У вас пока нет уведомлений",
  requests: "Нет входящих запросов",
  accepted: "Нет принятых запросов",
  rejected: "Нет отклонённых запросов",
};

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ item }: { item: TaggedRequest }) {
  if (item.status === "pending") {
    const label =
      item.direction === "incoming" ? "Новый запрос" : "Ожидает ответа";
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border bg-amber-500/10 text-amber-400 border-amber-500/20">
        <Clock className="w-3 h-3" />
        {label}
      </span>
    );
  }
  if (item.status === "accepted") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
        <Check className="w-3 h-3" />
        Принят
      </span>
    );
  }
  if (item.status === "declined") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border bg-red-500/10 text-red-400 border-red-500/20">
        <X className="w-3 h-3" />
        Отклонён
      </span>
    );
  }
  if (item.status === "cancelled") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border bg-red-500/10 text-red-400 border-red-500/20">
        <X className="w-3 h-3" />
        Отменён
      </span>
    );
  }
  return null;
}

// ─── Notification card ────────────────────────────────────────────────────────

interface NotificationCardProps {
  item: TaggedRequest;
  name: string;
  isProcessing: boolean;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
}

function NotificationCard({
  item,
  name,
  isProcessing,
  onAccept,
  onDecline,
}: NotificationCardProps) {
  const isPendingIncoming =
    item.status === "pending" && item.direction === "incoming";

  return (
    <div className="rounded-2xl border border-white/5 bg-zinc-900 p-5">
      {/* Top row: avatar + info + badge */}
      <div className="flex items-start justify-between gap-4">
        {/* Left */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center text-zinc-300 font-bold shrink-0 text-sm">
            {name[0]?.toUpperCase() ?? "?"}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-zinc-100 truncate">{name}</p>
            <p className="text-xs text-zinc-500 mt-0.5">
              {formatDate(item.created_at)}
            </p>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-zinc-500">
              <Users className="w-3 h-3 shrink-0" />
              <span>
                {item.direction === "incoming" ? "Входящий" : "Исходящий"}
              </span>
            </div>
          </div>
        </div>

        {/* Right: badge */}
        <div className="shrink-0 pt-0.5">
          <StatusBadge item={item} />
        </div>
      </div>

      {/* Action buttons — only for pending incoming requests */}
      {isPendingIncoming && (
        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-white/5">
          <button
            onClick={() => onAccept(item.id)}
            disabled={isProcessing}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-500 disabled:opacity-50 transition-colors"
          >
            <Check className="w-4 h-4" />
            Принять
          </button>
          <button
            onClick={() => onDecline(item.id)}
            disabled={isProcessing}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-red-500/30 text-red-400 text-sm font-medium hover:bg-red-500/10 disabled:opacity-50 transition-colors"
          >
            <X className="w-4 h-4" />
            Отклонить
          </button>
          {isProcessing && (
            <div className="w-4 h-4 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin ml-1" />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function InAppNotificationCard({ item }: { item: InAppNotification }) {
  const isCompletionPrompt = item.type === "exchange_completion_triggered";

  return (
    <div className="rounded-2xl border border-blue-500/15 bg-blue-500/5 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-blue-500/15 flex items-center justify-center text-blue-300 shrink-0">
            <Bell className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-zinc-100">{item.title}</p>
            <p className="text-sm text-zinc-400 mt-1 leading-6">{item.body}</p>
            <p className="text-xs text-zinc-600 mt-2">
              {formatDate(item.created_at)}
            </p>
          </div>
        </div>
        {isCompletionPrompt && (
          <button
            onClick={() => {
              window.location.href = "/dashboard/chats";
            }}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
            Чат
          </button>
        )}
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  const router = useRouter();
  const setPendingNotificationsCount = useChatStore(
    (state) => state.setPendingNotificationsCount,
  );
  const setIncomingRequests = useChatStore((state) => state.setIncomingRequests);

  const [activeTab, setActiveTab] = useState<ActiveTab>("all");
  const [incoming, setIncoming] = useState<ExchangeRequest[]>([]);
  const [sent, setSent] = useState<ExchangeRequest[]>([]);
  const [inAppNotifications, setInAppNotifications] = useState<
    InAppNotification[]
  >([]);
  const [profileById, setProfileById] = useState<Record<string, MatchProfile>>(
    {},
  );
  const loadedProfileIdsRef = useRef<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

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

  const loadPartnerProfiles = useCallback(
    async (inc: ExchangeRequest[], snt: ExchangeRequest[]) => {
      const ids = new Set<string>();
      for (const req of inc) ids.add(req.from_user_id);
      for (const req of snt) ids.add(req.to_user_id);

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
    },
    [],
  );

  // ── Data fetching ───────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [inc, snt, alerts] = await Promise.all([
        api.getIncomingRequests(),
        api.getSentRequests(),
        api.getInAppNotifications().catch(() => []),
      ]);
      // The API returns null (not []) when there are zero requests.
      // Guard here so downstream .map() calls never operate on null.
      const nextIncoming = Array.isArray(inc) ? inc : [];
      const nextSent = Array.isArray(snt) ? snt : [];
      setIncoming(nextIncoming);
      setSent(nextSent);
      setInAppNotifications(Array.isArray(alerts) ? alerts : []);
      setIncomingRequests(nextIncoming);
      setPendingNotificationsCount(
        nextIncoming.filter((request) => request.status === "pending").length +
          (Array.isArray(alerts) ? alerts.length : 0),
      );
      void loadPartnerProfiles(nextIncoming, nextSent);
    } catch (err) {
      console.error("Failed to load notifications:", err);
    } finally {
      setLoading(false);
    }
  }, [loadPartnerProfiles, setIncomingRequests, setPendingNotificationsCount]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Derived: combine + tag + sort ───────────────────────────────────────────
  const allNotifications: TaggedRequest[] = [
    ...(Array.isArray(incoming) ? incoming : []).map((r) => ({
      ...r,
      direction: "incoming" as const,
    })),
    ...(Array.isArray(sent) ? sent : []).map((r) => ({
      ...r,
      direction: "outgoing" as const,
    })),
  ].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  const filteredNotifications = allNotifications.filter((item) => {
    switch (activeTab) {
      case "all":
        return true;
      case "requests":
        return item.direction === "incoming" && item.status === "pending";
      case "accepted":
        return item.status === "accepted";
      case "rejected":
        return item.status === "declined" || item.status === "cancelled";
      default:
        return true;
    }
  });
  const visibleInAppNotifications =
    activeTab === "all" ? inAppNotifications : [];

  // ── Actions ─────────────────────────────────────────────────────────────────
  const startProcessing = (id: string) =>
    setProcessingIds((prev) => new Set(prev).add(id));

  const stopProcessing = (id: string) =>
    setProcessingIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

  const handleAccept = useCallback(
    async (id: string) => {
      startProcessing(id);
      try {
        await api.acceptRequest(id);
        await loadData();
      } catch (err) {
        console.error("Failed to accept request:", err);
      } finally {
        stopProcessing(id);
      }
    },
    [loadData],
  );

  const handleDecline = useCallback(
    async (id: string) => {
      startProcessing(id);
      try {
        await api.declineRequest(id);
        await loadData();
      } catch (err) {
        console.error("Failed to decline request:", err);
      } finally {
        stopProcessing(id);
      }
    },
    [loadData],
  );

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
          <Bell className="w-6 h-6 text-blue-400" />
          Уведомления
        </h1>
        <p className="text-zinc-400 mt-1 text-sm">
          Управляйте запросами на обмен навыками
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-zinc-900 border border-white/5 rounded-2xl p-1 mb-6">
        {(["all", "requests", "accepted", "rejected"] as ActiveTab[]).map(
          (tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={clsx(
                "flex-1 py-2 rounded-xl text-sm font-medium transition-all",
                activeTab === tab
                  ? "bg-zinc-800 text-white shadow"
                  : "text-zinc-500 hover:text-zinc-300",
              )}
            >
              {TAB_LABELS[tab]}
            </button>
          ),
        )}
      </div>

      {/* Loading spinner */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Notification list */}
      {!loading && (
        <div className="space-y-3">
          {visibleInAppNotifications.map((item) => (
            <InAppNotificationCard key={item.id} item={item} />
          ))}

          {filteredNotifications.map((item) => {
            const name = getContactName(item, profileById);
            return (
              <NotificationCard
                key={`${item.direction}-${item.id}`}
                item={item}
                name={name}
                isProcessing={processingIds.has(item.id)}
                onAccept={handleAccept}
                onDecline={handleDecline}
              />
            );
          })}

          {/* Empty state */}
          {filteredNotifications.length === 0 &&
            visibleInAppNotifications.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-white/5 flex items-center justify-center">
                <Bell className="w-6 h-6 text-zinc-600" />
              </div>
              <p className="font-medium text-zinc-400">Нет уведомлений</p>
              <p className="text-zinc-600 text-sm">
                {EMPTY_MESSAGES[activeTab]}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
