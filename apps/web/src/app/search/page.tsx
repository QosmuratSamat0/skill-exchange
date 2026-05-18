"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@/hooks/useChat";
import { useChatStore } from "@/store/chatStore";
import { api } from "@/lib/api";
import { ProfileCard } from "@/components/ProfileCard";
import { SkillTag } from "@/components/SkillTag";
import { StatsBar } from "@/components/StatsBar";
import type { ExchangeRequest, MatchProfile, Message } from "@/types/index";
import {
  CheckCircle2,
  ChevronRight,
  Clock,
  Inbox,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  X,
  XCircle,
} from "lucide-react";
import { clsx } from "clsx";

type Tab = "vitrine" | "chat" | "incoming" | "outgoing";

const partnerFallback: MatchProfile = {
  user_id: "",
  name: "Партнёр по обмену",
  i_have: [],
  i_want: [],
  bio: "Профиль ещё загружается.",
  updated_at: "",
};

function splitSkills(value: string) {
  return value
    .split(",")
    .map((skill) => skill.trim())
    .filter(Boolean);
}

function getInitials(name: string) {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "??"
  );
}

function formatTime(value: number | string) {
  const timestamp =
    typeof value === "number" && value < 1e12 ? value * 1000 : value;
  return new Date(timestamp).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(value?: string) {
  if (!value) return "Недавно";
  return new Date(value).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
  });
}

function matchPercent(profile?: MatchProfile) {
  const skills =
    (profile?.i_have?.length ?? 0) + (profile?.i_want?.length ?? 0);
  return Math.max(68, Math.min(94, 74 + (skills % 5) * 5));
}

function pickRequestProfile(
  request: ExchangeRequest,
  direction: "incoming" | "outgoing",
  candidates: MatchProfile[],
) {
  const embedded =
    direction === "incoming"
      ? (request.sender ?? request.from_user_profile)
      : (request.receiver ?? request.to_user_profile);
  if (embedded) return embedded;

  const userId =
    direction === "incoming" ? request.from_user_id : request.to_user_id;
  return (
    candidates.find((profile) => profile.user_id === userId) ?? {
      ...partnerFallback,
      user_id: userId,
      name:
        direction === "incoming" ? "Новый партнёр" : "Партнёр ожидает ответ",
    }
  );
}

function Avatar({
  name,
  size = "md",
}: {
  name: string;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <div
      className={clsx(
        "flex shrink-0 select-none items-center justify-center rounded-full border border-white/5 bg-gradient-to-br from-blue-500 to-emerald-500 font-semibold text-white",
        size === "sm" && "h-8 w-8 text-xs",
        size === "md" && "h-11 w-11 text-sm",
        size === "lg" && "h-16 w-16 text-xl",
      )}
    >
      {getInitials(name)}
    </div>
  );
}

function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-lg font-semibold text-zinc-50">{title}</h1>
        <p className="mt-1 text-sm text-zinc-500">{description}</p>
      </div>
      {action}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-white/5 bg-zinc-900/40 px-6 py-16 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800/70 text-zinc-500">
        {icon}
      </div>
      <h3 className="mt-4 font-medium text-zinc-300">{title}</h3>
      <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-zinc-500">
        {description}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

function StatusBadge({ status }: { status: ExchangeRequest["status"] }) {
  if (status === "accepted") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
        <CheckCircle2 className="h-3 w-3" /> Принят
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-300">
        <Clock className="h-3 w-3" /> Ожидает
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-white/5 bg-zinc-800 px-2.5 py-1 text-xs font-medium text-zinc-400">
      <XCircle className="h-3 w-3" /> Отклонён
    </span>
  );
}

function SkillBlock({
  title,
  skills,
  variant,
}: {
  title: string;
  skills: string[];
  variant: "teach" | "learn";
}) {
  return (
    <div className="rounded-xl bg-zinc-800/40 p-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {title}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {skills.length ? (
          skills
            .slice(0, 5)
            .map((skill) => (
              <SkillTag key={skill} skill={skill} variant={variant} />
            ))
        ) : (
          <span className="text-xs text-zinc-500">Не указано</span>
        )}
      </div>
    </div>
  );
}

function RequestCard({
  request,
  profile,
  direction,
  loading,
  onAccept,
  onDecline,
  onCancel,
  onOpenChat,
}: {
  request: ExchangeRequest;
  profile: MatchProfile;
  direction: "incoming" | "outgoing";
  loading: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onCancel: () => void;
  onOpenChat: () => void;
}) {
  const name = profile.name || "Без имени";
  const isMuted =
    request.status === "declined" || request.status === "cancelled";

  return (
    <article
      className={clsx(
        "rounded-2xl border border-white/5 bg-zinc-900 p-5 transition-colors hover:border-white/10",
        isMuted && "opacity-60",
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <div className="relative">
            <Avatar name={name} />
            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-zinc-900 bg-emerald-500" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate font-semibold text-zinc-50">{name}</h3>
              <StatusBadge status={request.status} />
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-300">
                {matchPercent(profile)}% match
              </span>
            </div>
            <p className="mt-1 text-sm text-zinc-500">
              {profile.bio || "Пока нет описания"} ·{" "}
              {formatDate(request.created_at)}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 gap-2 sm:justify-end">
          {direction === "incoming" && request.status === "pending" && (
            <>
              <button
                type="button"
                onClick={onDecline}
                disabled={loading}
                className="rounded-lg border border-red-500/20 bg-transparent px-3.5 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/10 disabled:opacity-50"
              >
                Отклонить
              </button>
              <button
                type="button"
                onClick={onAccept}
                disabled={loading}
                className="rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
              >
                Принять
              </button>
            </>
          )}
          {direction === "outgoing" && request.status === "pending" && (
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="sleek-button-secondary px-3.5 py-2 text-sm disabled:opacity-50"
            >
              Отменить запрос
            </button>
          )}
          {request.status === "accepted" && (
            <button
              type="button"
              onClick={onOpenChat}
              className="sleek-button px-3.5 py-2 text-sm"
            >
              Открыть чат
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <SkillBlock
          title={direction === "incoming" ? "Может научить вас" : "Вы учите"}
          skills={
            direction === "incoming"
              ? (profile.i_have ?? [])
              : (profile.i_want ?? [])
          }
          variant="teach"
        />
        <SkillBlock
          title={
            direction === "incoming" ? "Хочет изучить" : "Вы хотите изучить"
          }
          skills={
            direction === "incoming"
              ? (profile.i_want ?? [])
              : (profile.i_have ?? [])
          }
          variant="learn"
        />
      </div>
    </article>
  );
}

function ProfileSheet({
  profile,
  onClose,
  onSendRequest,
}: {
  profile: MatchProfile;
  onClose: () => void;
  onSendRequest: (userId: string) => void;
}) {
  const name = profile.name || "Без имени";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="w-full rounded-t-2xl border border-white/10 bg-zinc-900 p-6 shadow-xl sm:max-w-xl sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar name={name} size="lg" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold text-zinc-50">{name}</h2>
                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-300">
                  {matchPercent(profile)}% match
                </span>
              </div>
              <p className="mt-1 text-sm text-zinc-500">
                Онлайн · Skill exchanger
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
            aria-label="Закрыть"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-5 text-sm leading-relaxed text-zinc-300">
          {profile.bio ||
            "Пока нет описания. Можно начать с короткого сообщения и договориться о формате обмена."}
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <SkillBlock
            title="Учит"
            skills={profile.i_have ?? []}
            variant="teach"
          />
          <SkillBlock
            title="Хочет изучить"
            skills={profile.i_want ?? []}
            variant="learn"
          />
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="sleek-button-secondary"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={() => {
              onSendRequest(profile.user_id);
              onClose();
            }}
            className="sleek-button inline-flex items-center justify-center gap-2"
          >
            Запросить обмен
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function MatchProfileModal({
  initial,
  onSave,
  onClose,
}: {
  initial: { name: string; i_have: string; i_want: string; bio: string };
  onSave: (data: {
    name: string;
    i_have: string;
    i_want: string;
    bio: string;
  }) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const teachPreview = splitSkills(form.i_have);
  const learnPreview = splitSkills(form.i_want);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-zinc-900 p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-zinc-50">
              Профиль для обмена
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Эти данные помогут подобрать партнёров
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Имя
            </span>
            <input
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
              placeholder="Как тебя зовут?"
              className="sleek-input w-full"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
              Навыки, которым я учу
            </span>
            <input
              value={form.i_have}
              onChange={(event) =>
                setForm({ ...form, i_have: event.target.value })
              }
              placeholder="Go, Docker, SQL"
              className="sleek-input w-full"
            />
            <div className="flex flex-wrap gap-1.5">
              {teachPreview.map((skill) => (
                <SkillTag key={skill} skill={skill} variant="teach" />
              ))}
            </div>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-300">
              Навыки, которые хочу изучить
            </span>
            <input
              value={form.i_want}
              onChange={(event) =>
                setForm({ ...form, i_want: event.target.value })
              }
              placeholder="React, UI/UX, English"
              className="sleek-input w-full"
            />
            <div className="flex flex-wrap gap-1.5">
              {learnPreview.map((skill) => (
                <SkillTag key={skill} skill={skill} variant="learn" />
              ))}
            </div>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              О себе
            </span>
            <textarea
              value={form.bio}
              onChange={(event) =>
                setForm({ ...form, bio: event.target.value })
              }
              placeholder="Например: Я backend developer, изучаю frontend и хочу практиковать React..."
              className="sleek-input min-h-[110px] w-full resize-none"
            />
          </label>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="sleek-button-secondary"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="sleek-button disabled:opacity-50"
          >
            {saving ? "Сохраняю..." : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}

function UserProfileModal({
  initial,
  onSave,
  onClose,
}: {
  initial: {
    name: string;
    avatar: string;
    bio: string;
    teach_skills: string;
    learn_skills: string;
  };
  onSave: (data: {
    name: string;
    avatar: string;
    bio: string;
    teach_skills: string;
    learn_skills: string;
  }) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-zinc-900 p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold text-zinc-50">
              Публичный профиль
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Виден другим участникам Pairexx
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Имя
            </span>
            <input
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
              className="sleek-input w-full"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Аватар URL
            </span>
            <input
              value={form.avatar}
              onChange={(event) =>
                setForm({ ...form, avatar: event.target.value })
              }
              placeholder="https://..."
              className="sleek-input w-full"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              О себе
            </span>
            <textarea
              value={form.bio}
              onChange={(event) =>
                setForm({ ...form, bio: event.target.value })
              }
              className="sleek-input min-h-[90px] w-full resize-none"
            />
          </label>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="sleek-button-secondary"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="sleek-button disabled:opacity-50"
          >
            {saving ? "Сохраняю..." : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChatMessage({
  msg,
  partnerName,
  grouped,
}: {
  msg: Message;
  partnerName: string;
  grouped: boolean;
}) {
  const isMe = msg.sender === "me";

  if (isMe) {
    return (
      <div className={clsx("flex justify-end", grouped ? "mt-1" : "mt-5")}>
        <div className="chat-bubble chat-bubble-me">
          <p>{msg.content}</p>
          <span className="mt-1 block text-right text-[10px] text-blue-100/70">
            {formatTime(msg.timestamp)}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={clsx("flex items-end gap-2", grouped ? "mt-1" : "mt-5")}>
      <div className="w-8 shrink-0">
        {!grouped && <Avatar name={partnerName} size="sm" />}
      </div>
      <div className="min-w-0 flex-1">
        {!grouped && (
          <p className="mb-1 ml-1 text-xs text-zinc-500">{partnerName}</p>
        )}
        <div className="chat-bubble chat-bubble-partner">
          <p>{msg.content}</p>
          <span className="mt-1 block text-[10px] text-zinc-500">
            {formatTime(msg.timestamp)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function VitrinePage() {
  const router = useRouter();

  const me = useChatStore((state) => state.me);
  const myMatchProfile = useChatStore((state) => state.myMatchProfile);
  const myStats = useChatStore((state) => state.myStats);
  const candidates = useChatStore((state) => state.candidates);
  const incomingRequests = useChatStore((state) => state.incomingRequests);
  const sentRequests = useChatStore((state) => state.sentRequests);
  const status = useChatStore((state) => state.status);
  const roomId = useChatStore((state) => state.roomId);
  const messages = useChatStore((state) => state.messages);
  const isPartnerTyping = useChatStore((state) => state.isPartnerTyping);

  const {
    refreshCandidates,
    refreshIncomingRequests,
    refreshSentRequests,
    sendRequest,
    acceptRequest,
    declineRequest,
    cancelRequest,
    loadActiveRoom,
    loadMyMatchProfile,
    loadMyStats,
    sendMessage,
    sendTyping,
    next,
  } = useChat();

  const [isInitReady, setIsInitReady] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("vitrine");
  const [isEditingMatchProfile, setIsEditingMatchProfile] = useState(false);
  const [isEditingUserProfile, setIsEditingUserProfile] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [previewProfile, setPreviewProfile] = useState<MatchProfile | null>(
    null,
  );
  const [loadingRequests, setLoadingRequests] = useState<Set<string>>(
    new Set(),
  );
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const [matchProfileForm, setMatchProfileForm] = useState({
    name: "",
    i_have: "",
    i_want: "",
    bio: "",
  });
  const [userProfileForm, setUserProfileForm] = useState({
    name: "",
    avatar: "",
    bio: "",
    teach_skills: "",
    learn_skills: "",
  });

  useEffect(() => {
    const init = async () => {
      const token = localStorage.getItem("access_token");
      if (!token || token === "undefined" || token === "null") {
        router.push("/auth");
        return;
      }
      try {
        await api.getMe();
      } catch {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        router.push("/auth");
        return;
      }
      setIsInitReady(true);
    };
    init();
  }, [router]);

  useEffect(() => {
    if (!isInitReady) return;
    refreshCandidates();
    refreshIncomingRequests();
    refreshSentRequests();
    loadMyMatchProfile();
    loadMyStats();
  }, [isInitReady]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!myMatchProfile) return;
    setMatchProfileForm({
      name: myMatchProfile.name ?? "",
      i_have: (myMatchProfile.i_have ?? []).join(", "),
      i_want: (myMatchProfile.i_want ?? []).join(", "),
      bio: myMatchProfile.bio ?? "",
    });
    setUserProfileForm((current) => ({
      ...current,
      name: myMatchProfile.name ?? current.name,
      bio: myMatchProfile.bio ?? current.bio,
      teach_skills: (myMatchProfile.i_have ?? []).join(", "),
      learn_skills: (myMatchProfile.i_want ?? []).join(", "),
    }));
  }, [myMatchProfile]);

  useEffect(() => {
    if (status === "matched" || status === "chatting") setActiveTab("chat");
  }, [status]);

  useEffect(() => {
    if (activeTab === "chat" && !roomId) void loadActiveRoom({ force: true });
  }, [activeTab, roomId, loadActiveRoom]);

  useEffect(() => {
    if (chatScrollRef.current)
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [messages, isPartnerTyping, activeTab]);

  const safeCandidates = candidates ?? [];
  const safeIncomingRequests = incomingRequests ?? [];
  const safeSentRequests = sentRequests ?? [];
  const pendingIncoming = safeIncomingRequests.filter(
    (request) => request.status === "pending",
  );
  const pendingOutgoing = safeSentRequests.filter(
    (request) => request.status === "pending",
  );
  const hasAcceptedChat =
    !!roomId ||
    safeIncomingRequests.some((request) => request.status === "accepted") ||
    safeSentRequests.some((request) => request.status === "accepted");

  const chatPartner = (() => {
    const accepted =
      safeIncomingRequests.find((request) => request.status === "accepted") ??
      safeSentRequests.find((request) => request.status === "accepted");
    if (!accepted) return partnerFallback;
    const direction = safeIncomingRequests.includes(accepted)
      ? "incoming"
      : "outgoing";
    return pickRequestProfile(accepted, direction, safeCandidates);
  })();

  const navItems = [
    {
      key: "vitrine" as Tab,
      label: "Витрина",
      icon: <Sparkles className="h-4 w-4" />,
    },
    {
      key: "chat" as Tab,
      label: "Чат",
      icon: <MessageSquare className="h-4 w-4" />,
      count: hasAcceptedChat ? 1 : 0,
    },
    {
      key: "incoming" as Tab,
      label: "Входящие",
      icon: <Inbox className="h-4 w-4" />,
      count: pendingIncoming.length,
    },
    {
      key: "outgoing" as Tab,
      label: "Исходящие",
      icon: <ChevronRight className="h-4 w-4" />,
      count: pendingOutgoing.length,
    },
  ];

  const handleSendRequest = useCallback(
    async (userId: string) => {
      setLoadingRequests((prev) => new Set(prev).add(userId));
      try {
        await sendRequest(userId);
        await refreshSentRequests();
      } finally {
        setLoadingRequests((prev) => {
          const nextSet = new Set(prev);
          nextSet.delete(userId);
          return nextSet;
        });
      }
    },
    [sendRequest, refreshSentRequests],
  );

  const handleAccept = useCallback(
    async (reqId: string) => {
      setLoadingRequests((prev) => new Set(prev).add(reqId));
      try {
        await acceptRequest(reqId);
      } finally {
        setLoadingRequests((prev) => {
          const nextSet = new Set(prev);
          nextSet.delete(reqId);
          return nextSet;
        });
      }
    },
    [acceptRequest],
  );

  const handleDecline = useCallback(
    async (reqId: string) => {
      setLoadingRequests((prev) => new Set(prev).add(reqId));
      try {
        await declineRequest(reqId);
      } finally {
        setLoadingRequests((prev) => {
          const nextSet = new Set(prev);
          nextSet.delete(reqId);
          return nextSet;
        });
      }
    },
    [declineRequest],
  );

  const handleCancel = useCallback(
    async (reqId: string) => {
      setLoadingRequests((prev) => new Set(prev).add(reqId));
      try {
        await cancelRequest(reqId);
        await refreshSentRequests();
      } finally {
        setLoadingRequests((prev) => {
          const nextSet = new Set(prev);
          nextSet.delete(reqId);
          return nextSet;
        });
      }
    },
    [cancelRequest, refreshSentRequests],
  );

  const handleOpenChat = useCallback(() => {
    setActiveTab("chat");
    void loadActiveRoom({ force: true });
  }, [loadActiveRoom]);

  const handleChatSend = useCallback(
    (event?: React.FormEvent) => {
      event?.preventDefault();
      const text = chatInput.trim();
      if (!text) return;
      const sent = sendMessage(text);
      if (!sent) return;
      setChatInput("");
      sendTyping(false);
    },
    [chatInput, sendMessage, sendTyping],
  );

  const handleChatInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setChatInput(event.target.value);
      sendTyping(event.target.value.length > 0);
    },
    [sendTyping],
  );

  const handleEndChat = useCallback(() => {
    next();
    setActiveTab("vitrine");
  }, [next]);

  const handleSaveMatchProfile = async (form: typeof matchProfileForm) => {
    await api.updateMatchProfile({
      name: form.name,
      i_have: splitSkills(form.i_have),
      i_want: splitSkills(form.i_want),
      bio: form.bio,
    });
    await loadMyMatchProfile();
    await refreshCandidates();
    setIsEditingMatchProfile(false);
  };

  const handleSaveUserProfile = async (form: typeof userProfileForm) => {
    await api.updateUserProfile({
      name: form.name,
      avatar: form.avatar,
      bio: form.bio,
      teach_skills: splitSkills(form.teach_skills),
      learn_skills: splitSkills(form.learn_skills),
    });
    setIsEditingUserProfile(false);
  };

  if (!isInitReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="text-sm text-zinc-500">Загрузка...</div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50">
      <header className="sticky top-0 z-30 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
              <Sparkles className="h-4 w-4 fill-white/20 text-white" />
            </div>
            <span className="text-base font-bold tracking-tight">Pairexx</span>
          </div>
          <StatsBar stats={myStats} />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsEditingMatchProfile(true)}
              className="hidden rounded-lg border border-white/5 bg-zinc-900 px-3 py-2 text-sm text-zinc-300 transition-colors hover:border-white/10 hover:bg-zinc-800 sm:inline-flex"
            >
              Профиль обмена
            </button>
            <button
              type="button"
              onClick={() => setIsEditingUserProfile(true)}
              className="flex items-center gap-2 rounded-lg border border-white/5 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-300 transition-colors hover:border-white/10 hover:bg-zinc-800"
            >
              <Avatar
                name={
                  myMatchProfile?.name ||
                  (me?.is_anonymous ? "Аноним" : "Профиль")
                }
                size="sm"
              />
              <span className="hidden max-w-28 truncate sm:inline">
                {myMatchProfile?.name ||
                  (me?.is_anonymous ? "Аноним" : "Профиль")}
              </span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-6 px-4 pb-28 pt-6 sm:px-6 lg:px-8">
        <aside className="sticky top-20 hidden h-[calc(100vh-6rem)] w-52 shrink-0 rounded-2xl border border-white/5 bg-zinc-900/70 p-2 md:block">
          <nav className="space-y-1">
            {navItems.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() =>
                  item.key === "chat"
                    ? handleOpenChat()
                    : setActiveTab(item.key)
                }
                className={clsx(
                  "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
                  activeTab === item.key
                    ? "bg-white/[0.07] text-zinc-50"
                    : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100",
                )}
              >
                {item.icon}
                <span>{item.label}</span>
                {item.count ? (
                  <span className="ml-auto rounded-full bg-blue-600 px-1.5 text-[10px] font-bold text-white">
                    {item.count > 9 ? "9+" : item.count}
                  </span>
                ) : null}
              </button>
            ))}
          </nav>
        </aside>

        <div className="min-w-0 flex-1">
          {activeTab === "vitrine" && (
            <section className="space-y-5">
              <PageHeader
                title="Рекомендованные партнёры"
                description="Подобраны по совпадению навыков и готовности к обмену"
                action={
                  <button
                    type="button"
                    onClick={refreshCandidates}
                    className="sleek-button-secondary inline-flex items-center gap-2 px-3.5 py-2 text-sm"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Обновить
                  </button>
                }
              />

              {safeCandidates.length === 0 ? (
                <EmptyState
                  icon={<Search className="h-5 w-5" />}
                  title="Нет рекомендованных партнёров"
                  description="Заполните профиль обмена, и Pairexx подберёт людей с подходящими навыками."
                  action={
                    <button
                      type="button"
                      onClick={() => setIsEditingMatchProfile(true)}
                      className="sleek-button"
                    >
                      Настроить профиль
                    </button>
                  }
                />
              ) : (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
                  {safeCandidates.map((candidate) => (
                    <ProfileCard
                      key={candidate.user_id}
                      profile={candidate}
                      onSendRequest={handleSendRequest}
                      isLoading={loadingRequests.has(candidate.user_id)}
                      onClick={() => setPreviewProfile(candidate)}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {activeTab === "chat" && (
            <section className="mx-auto flex h-[calc(100vh-7rem)] max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/5 bg-zinc-900">
              <div className="flex items-center justify-between gap-3 border-b border-white/5 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="relative">
                    <Avatar name={chatPartner.name} />
                    <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-zinc-900 bg-emerald-500" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate font-semibold text-zinc-50">
                        {chatPartner.name}
                      </h2>
                      <SkillTag
                        skill={(chatPartner.i_have ?? [])[0] || "React"}
                        variant="teach"
                      />
                      <span className="text-xs text-zinc-500">↔</span>
                      <SkillTag
                        skill={(chatPartner.i_want ?? [])[0] || "Go"}
                        variant="learn"
                      />
                    </div>
                    <p className="mt-0.5 text-xs text-emerald-400">
                      {roomId ? "онлайн сейчас" : "нет активной комнаты"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleEndChat}
                  disabled={!roomId}
                  className="rounded-lg border border-red-500/20 bg-transparent px-3 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/10 disabled:opacity-40"
                >
                  Завершить обмен
                </button>
              </div>

              <div
                ref={chatScrollRef}
                className="flex-1 overflow-y-auto px-4 py-5"
              >
                {!roomId && (
                  <EmptyState
                    icon={<MessageSquare className="h-5 w-5" />}
                    title="Нет активного обмена"
                    description="Примите входящий запрос или откройте уже принятый обмен."
                    action={
                      hasAcceptedChat ? (
                        <button
                          type="button"
                          onClick={handleOpenChat}
                          className="sleek-button"
                        >
                          Подключить чат
                        </button>
                      ) : null
                    }
                  />
                )}

                {roomId && messages.length === 0 && (
                  <div className="flex h-full flex-col items-center justify-center text-center">
                    <Avatar name={chatPartner.name} size="lg" />
                    <h3 className="mt-4 font-semibold text-zinc-100">
                      Начните обмен с {chatPartner.name}
                    </h3>
                    <p className="mt-1 max-w-sm text-sm text-zinc-500">
                      Вы можете договориться о времени, формате занятия и первом
                      навыке для практики.
                    </p>
                  </div>
                )}

                {(messages as Message[]).map((msg, index) => {
                  const prev = messages[index - 1];
                  const grouped = !!prev && prev.sender === msg.sender;
                  return (
                    <ChatMessage
                      key={msg.id ?? index}
                      msg={msg}
                      partnerName={chatPartner.name}
                      grouped={grouped}
                    />
                  );
                })}

                {isPartnerTyping && (
                  <div className="mt-5 flex items-end gap-2">
                    <Avatar name={chatPartner.name} size="sm" />
                    <div className="rounded-2xl rounded-bl-md bg-zinc-800 px-4 py-3">
                      <div className="flex gap-1.5">
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500 [animation-delay:0.2s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500 [animation-delay:0.4s]" />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <form
                onSubmit={handleChatSend}
                className="border-t border-white/5 bg-zinc-950/40 p-3"
              >
                <div className="flex items-center gap-2">
                  <input
                    value={chatInput}
                    onChange={handleChatInputChange}
                    placeholder={
                      roomId
                        ? "Напишите сообщение..."
                        : "Сначала подключите чат"
                    }
                    disabled={!roomId}
                    className="sleek-input flex-1 rounded-full disabled:opacity-50"
                    aria-label="Сообщение"
                  />
                  <button
                    type="submit"
                    disabled={!roomId || !chatInput.trim()}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white transition-colors hover:bg-blue-500 disabled:opacity-40"
                    aria-label="Отправить сообщение"
                  >
                    <Send className="h-5 w-5" />
                  </button>
                </div>
              </form>
            </section>
          )}

          {activeTab === "incoming" && (
            <section className="mx-auto max-w-4xl space-y-5">
              <PageHeader
                title="Входящие запросы"
                description="Люди, которые хотят обменяться навыками с вами"
                action={
                  <button
                    type="button"
                    onClick={refreshIncomingRequests}
                    className="sleek-button-secondary px-3.5 py-2 text-sm"
                  >
                    Обновить
                  </button>
                }
              />
              {safeIncomingRequests.length === 0 ? (
                <EmptyState
                  icon={<Inbox className="h-5 w-5" />}
                  title="Нет входящих запросов"
                  description="Новые запросы появятся здесь, когда кто-то захочет обменяться с вами."
                />
              ) : (
                <div className="space-y-3">
                  {safeIncomingRequests.map((request) => (
                    <RequestCard
                      key={request.id}
                      request={request}
                      profile={pickRequestProfile(
                        request,
                        "incoming",
                        safeCandidates,
                      )}
                      direction="incoming"
                      loading={loadingRequests.has(request.id)}
                      onAccept={() => handleAccept(request.id)}
                      onDecline={() => handleDecline(request.id)}
                      onCancel={() => handleCancel(request.id)}
                      onOpenChat={handleOpenChat}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {activeTab === "outgoing" && (
            <section className="mx-auto max-w-4xl space-y-5">
              <PageHeader
                title="Исходящие запросы"
                description="Запросы, которые вы отправили другим участникам"
                action={
                  <button
                    type="button"
                    onClick={refreshSentRequests}
                    className="sleek-button-secondary px-3.5 py-2 text-sm"
                  >
                    Обновить
                  </button>
                }
              />
              {safeSentRequests.length === 0 ? (
                <EmptyState
                  icon={<Send className="h-5 w-5" />}
                  title="Нет исходящих запросов"
                  description="Запросите обмен у подходящего партнёра, и статус появится здесь."
                />
              ) : (
                <div className="space-y-3">
                  {safeSentRequests.map((request) => (
                    <RequestCard
                      key={request.id}
                      request={request}
                      profile={pickRequestProfile(
                        request,
                        "outgoing",
                        safeCandidates,
                      )}
                      direction="outgoing"
                      loading={loadingRequests.has(request.id)}
                      onAccept={() => handleAccept(request.id)}
                      onDecline={() => handleDecline(request.id)}
                      onCancel={() => handleCancel(request.id)}
                      onOpenChat={handleOpenChat}
                    />
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </div>

      <nav className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-white/5 bg-zinc-900/95 p-1 shadow-2xl backdrop-blur md:hidden">
        {navItems.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() =>
              item.key === "chat" ? handleOpenChat() : setActiveTab(item.key)
            }
            className={clsx(
              "relative flex w-20 flex-col items-center gap-1 rounded-xl px-2 py-2 text-xs transition-colors",
              activeTab === item.key
                ? "bg-white/[0.07] text-blue-300"
                : "text-zinc-500",
            )}
          >
            {item.icon}
            <span>{item.label}</span>
            {item.count ? (
              <span className="absolute right-2 top-1 rounded-full bg-blue-600 px-1 text-[9px] font-bold text-white">
                {item.count > 9 ? "9+" : item.count}
              </span>
            ) : null}
          </button>
        ))}
      </nav>

      {previewProfile && (
        <ProfileSheet
          profile={previewProfile}
          onClose={() => setPreviewProfile(null)}
          onSendRequest={handleSendRequest}
        />
      )}

      {isEditingMatchProfile && (
        <MatchProfileModal
          initial={matchProfileForm}
          onSave={handleSaveMatchProfile}
          onClose={() => setIsEditingMatchProfile(false)}
        />
      )}

      {isEditingUserProfile && (
        <UserProfileModal
          initial={userProfileForm}
          onSave={handleSaveUserProfile}
          onClose={() => setIsEditingUserProfile(false)}
        />
      )}
    </main>
  );
}
