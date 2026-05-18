"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  SendHorizonal,
  PackageSearch,
  Zap,
  Clock,
  Check,
  X,
  TrendingUp,
} from "lucide-react";
import { clsx } from "clsx";
import { api } from "@/lib/api";
import { useChatStore } from "@/store/chatStore";
import type { MatchProfile, ExchangeRequest, Room } from "@/types/index";

// ─── Domain types ─────────────────────────────────────────────────────────────

type MatchTier = "primary" | "secondary" | "tertiary" | "none";
type ConnectionState =
  | "none"
  | "pending_sent"
  | "pending_received"
  | "connected";

interface EnrichedCandidate extends MatchProfile {
  tier: MatchTier;
  /** Skills from their i_have that match my i_want (they can teach me) */
  teachMeSkills: string[];
  /** Skills from their i_want that match my i_have (I can teach them) */
  teachThemSkills: string[];
}

// ─── Skill matching helpers ───────────────────────────────────────────────────

function normSkill(s: string) {
  return s.toLowerCase().trim();
}

/** True when two skill strings partially match (handles "Go" ↔ "Golang"). */
function skillMatch(a: string, b: string): boolean {
  const an = normSkill(a);
  const bn = normSkill(b);
  if (!an || !bn) return false;
  return an === bn || an.includes(bn) || bn.includes(an);
}

function findOverlap(needs: string[], supply: string[]): string[] {
  const result: string[] = [];
  for (const need of needs) {
    for (const s of supply) {
      if (skillMatch(need, s)) {
        result.push(need);
        break;
      }
    }
  }
  return result;
}

function computeTier(
  myIHave: string[],
  myIWant: string[],
  theirIHave: string[],
  theirIWant: string[],
): { tier: MatchTier; teachMe: string[]; teachThem: string[] } {
  const teachMe = findOverlap(myIWant, theirIHave); // they know what I want
  const teachThem = findOverlap(theirIWant, myIHave); // I know what they want
  let tier: MatchTier = "none";
  if (teachMe.length > 0 && teachThem.length > 0) tier = "primary";
  else if (teachMe.length > 0) tier = "secondary";
  else if (teachThem.length > 0) tier = "tertiary";
  return { tier, teachMe, teachThem };
}

function enrichCandidates(
  candidates: MatchProfile[],
  me: MatchProfile | null,
): EnrichedCandidate[] {
  return candidates.map((c) => {
    if (!me) {
      return {
        ...c,
        tier: "none" as MatchTier,
        teachMeSkills: [],
        teachThemSkills: [],
      };
    }
    const { tier, teachMe, teachThem } = computeTier(
      me.i_have,
      me.i_want,
      c.i_have,
      c.i_want,
    );
    return { ...c, tier, teachMeSkills: teachMe, teachThemSkills: teachThem };
  });
}

const TIER_ORDER: Record<MatchTier, number> = {
  primary: 0,
  secondary: 1,
  tertiary: 2,
  none: 3,
};

// ─── Connection state ─────────────────────────────────────────────────────────

function getConnectionState(
  candidateId: string,
  incoming: ExchangeRequest[],
  sent: ExchangeRequest[],
  rooms: Room[],
): ConnectionState {
  const connectedFromRooms = rooms.some(
    (room) => room.user_a === candidateId || room.user_b === candidateId,
  );
  const accepted =
    incoming.some(
      (r) => r.from_user_id === candidateId && r.status === "accepted",
    ) ||
    sent.some((r) => r.to_user_id === candidateId && r.status === "accepted");
  if (accepted || connectedFromRooms) return "connected";

  if (
    incoming.some(
      (r) => r.from_user_id === candidateId && r.status === "pending",
    )
  )
    return "pending_received";

  if (sent.some((r) => r.to_user_id === candidateId && r.status === "pending"))
    return "pending_sent";

  return "none";
}

// ─── Icebreaker message ───────────────────────────────────────────────────────

function buildIcebreaker(c: EnrichedCandidate, me: MatchProfile): string {
  const theyTeach = c.teachMeSkills[0] ?? c.i_have[0] ?? "своим навыком";
  const iTeach = c.teachThemSkills[0] ?? me.i_have[0] ?? "своим навыком";
  return `Привет! Я хочу изучить ${theyTeach}, а ты — ${iTeach}. Давай обменяемся знаниями? 🤝`;
}

// ─── Tier Badge ───────────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: MatchTier }) {
  if (tier === "primary")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-bold px-2 py-0.5 tracking-wide uppercase">
        <Zap className="w-2.5 h-2.5 fill-amber-300" />
        Идеальный мэтч
      </span>
    );
  if (tier === "secondary")
    return (
      <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] px-2 py-0.5">
        Могут научить тебя
      </span>
    );
  if (tier === "tertiary")
    return (
      <span className="rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] px-2 py-0.5">
        Хотят учиться у тебя
      </span>
    );
  return null;
}

// ─── Skill Chip ───────────────────────────────────────────────────────────────

type ChipContext = "teach-me" | "teach-them" | "neutral";

function SkillChip({
  label,
  context,
}: {
  label: string;
  context: ChipContext;
}) {
  return (
    <span
      className={clsx(
        "rounded-full text-xs px-2 py-0.5 border font-medium",
        context === "teach-me" &&
          "bg-emerald-500/15 border-emerald-500/25 text-emerald-400",
        context === "teach-them" &&
          "bg-blue-500/15 border-blue-500/25 text-blue-400",
        context === "neutral" && "bg-zinc-800/80 border-white/5 text-zinc-500",
      )}
    >
      {label}
    </span>
  );
}

// ─── Candidate Card ───────────────────────────────────────────────────────────

interface CardProps {
  candidate: EnrichedCandidate;
  connState: ConnectionState;
  isLoading: boolean;
  myProfile: MatchProfile | null;
  onSend: () => void;
  onAccept: () => void;
  onGoToChats: () => void;
}

function CandidateCard({
  candidate,
  connState,
  isLoading,
  myProfile,
  onSend,
  onAccept,
  onGoToChats,
}: CardProps) {
  const initial = candidate.name.charAt(0).toUpperCase() || "?";

  const iHaveChips = candidate.i_have.map((skill) => ({
    label: skill,
    context: candidate.teachMeSkills.some((s) => skillMatch(s, skill))
      ? ("teach-me" as ChipContext)
      : ("neutral" as ChipContext),
  }));

  const iWantChips = candidate.i_want.map((skill) => ({
    label: skill,
    context: candidate.teachThemSkills.some((s) => skillMatch(s, skill))
      ? ("teach-them" as ChipContext)
      : ("neutral" as ChipContext),
  }));

  const isPrimary = candidate.tier === "primary";

  return (
    <div
      className={clsx(
        "rounded-2xl border p-5 flex flex-col gap-4 transition-colors",
        isPrimary
          ? "border-amber-500/20 bg-zinc-900 hover:border-amber-500/35"
          : "border-white/5 bg-zinc-900 hover:border-zinc-700",
      )}
    >
      {/* Avatar + name row */}
      <div className="flex items-start gap-3">
        <div
          className={clsx(
            "w-11 h-11 rounded-full flex items-center justify-center font-bold text-base shrink-0 border",
            isPrimary
              ? "bg-amber-500/15 border-amber-500/25 text-amber-300"
              : "bg-blue-600/20 border-blue-600/30 text-blue-400",
          )}
        >
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-zinc-100 truncate text-sm">
            {candidate.name}
          </p>
          {candidate.bio ? (
            <p className="text-xs text-zinc-500 truncate mt-0.5 leading-relaxed">
              {candidate.bio}
            </p>
          ) : null}
          <div className="mt-1.5">
            <TierBadge tier={candidate.tier} />
          </div>
        </div>
      </div>

      {/* Skill chips */}
      <div className="space-y-2.5 flex-1">
        {iHaveChips.length > 0 && (
          <div>
            <p className="text-xs text-zinc-500 mb-1.5">
              Могу научить
              {candidate.teachMeSkills.length > 0 && (
                <span className="ml-1.5 text-emerald-400 font-medium">
                  · {candidate.teachMeSkills.length}{" "}
                  {candidate.teachMeSkills.length === 1
                    ? "совпадение"
                    : "совпадения"}
                </span>
              )}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {iHaveChips.map(({ label, context }) => (
                <SkillChip key={label} label={label} context={context} />
              ))}
            </div>
          </div>
        )}

        {iWantChips.length > 0 && (
          <div>
            <p className="text-xs text-zinc-500 mb-1.5">
              Хочу изучить
              {candidate.teachThemSkills.length > 0 && (
                <span className="ml-1.5 text-blue-400 font-medium">
                  · {candidate.teachThemSkills.length}{" "}
                  {candidate.teachThemSkills.length === 1
                    ? "совпадение"
                    : "совпадения"}
                </span>
              )}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {iWantChips.map(({ label, context }) => (
                <SkillChip key={label} label={label} context={context} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Action button — 4 connection states ── */}

      {connState === "connected" && (
        <button
          onClick={onGoToChats}
          className="w-full rounded-lg px-4 py-2.5 text-sm font-medium border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition-colors flex items-center justify-center gap-2"
        >
          <Check className="w-4 h-4" />В контактах — написать
        </button>
      )}

      {connState === "pending_received" && (
        <button
          onClick={onAccept}
          disabled={isLoading}
          className="w-full rounded-lg px-4 py-2.5 text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <Check className="w-4 h-4" />
              Принять запрос
            </>
          )}
        </button>
      )}

      {connState === "pending_sent" && (
        <button
          disabled
          className="w-full rounded-lg px-4 py-2.5 text-sm font-medium bg-zinc-800 text-zinc-500 cursor-not-allowed border border-white/5 flex items-center justify-center gap-2"
        >
          <Clock className="w-4 h-4" />
          Ожидание ответа
        </button>
      )}

      {connState === "none" && (
        <div className="flex gap-2">
          <button
            onClick={onSend}
            disabled={isLoading}
            className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 active:bg-blue-700 transition-colors flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <SendHorizonal className="w-4 h-4" />
                Запросить обмен
              </>
            )}
          </button>

          {/* ⚡ Icebreaker quick-send for perfect matches */}
          {isPrimary && myProfile && (
            <button
              onClick={onSend}
              disabled={isLoading}
              title={buildIcebreaker(candidate, myProfile)}
              className="rounded-lg px-3 py-2.5 bg-amber-500/15 border border-amber-500/20 text-amber-400 hover:bg-amber-500/25 disabled:opacity-50 transition-colors shrink-0"
              aria-label="Отправить запрос с шаблонным приветствием"
            >
              <Zap className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Trending skills fallback ─────────────────────────────────────────────────

const TRENDING_SKILLS = [
  "Go",
  "TypeScript",
  "React",
  "Next.js",
  "Python",
  "Docker",
  "Figma",
  "PostgreSQL",
  "Rust",
  "Machine Learning",
  "Kubernetes",
  "Swift",
];

function TrendingFallback({ onSearch }: { onSearch: (skill: string) => void }) {
  return (
    <div className="py-16 text-center">
      <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-white/5 flex items-center justify-center mx-auto mb-4">
        <TrendingUp className="w-6 h-6 text-zinc-500" />
      </div>
      <h3 className="font-semibold text-zinc-300 mb-1">
        Рекомендации не найдены
      </h3>
      <p className="text-sm text-zinc-600 max-w-sm mx-auto leading-relaxed mb-5">
        Добавьте навыки в профиль, чтобы получить персональные рекомендации. Или
        попробуйте поискать по популярному навыку:
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {TRENDING_SKILLS.map((skill) => (
          <button
            key={skill}
            onClick={() => onSearch(skill)}
            className="rounded-full border border-white/10 bg-zinc-800/60 text-zinc-300 hover:border-blue-500/40 hover:text-blue-400 hover:bg-blue-500/10 transition-colors text-sm px-3 py-1.5"
          >
            {skill}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FindPage() {
  const router = useRouter();
  const cachedMatchProfile = useChatStore((state) => state.myMatchProfile);
  const setCachedMatchProfile = useChatStore(
    (state) => state.setMyMatchProfile,
  );
  const initialCachedMatchProfileRef = useRef(cachedMatchProfile);

  // ── State ──────────────────────────────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<MatchProfile[]>([]);
  const [searchExtra, setSearchExtra] = useState<MatchProfile[]>([]);
  const [myProfile, setMyProfile] = useState<MatchProfile | null>(
    cachedMatchProfile,
  );
  // null  = not yet checked
  // false = checked, doesn't exist (needs setup)
  // true  = exists
  const [hasMatchProfile, setHasMatchProfile] = useState<boolean | null>(
    cachedMatchProfile ? true : null,
  );
  const [incoming, setIncoming] = useState<ExchangeRequest[]>([]);
  const [sent, setSent] = useState<ExchangeRequest[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => {
    if (!cachedMatchProfile) return;
    setMyProfile(cachedMatchProfile);
    setHasMatchProfile(true);
  }, [cachedMatchProfile]);

  // ── Initial load ───────────────────────────────────────────────────────────
  useEffect(() => {
    void Promise.allSettled([
      api
        .getCandidates()
        .then((d) => setCandidates(Array.isArray(d) ? d : []))
        .catch(() => {}),
      api
        .getMatchProfile()
        .then((p) => {
          if (p) {
            setCachedMatchProfile(p);
            setMyProfile(p);
            setHasMatchProfile(true);
            return;
          }

          if (!initialCachedMatchProfileRef.current) {
            setCachedMatchProfile(null);
            setHasMatchProfile(false);
          }
        })
        .catch(() => {
          if (!initialCachedMatchProfileRef.current) {
            setHasMatchProfile(false);
          }
        }),
      api
        .getIncomingRequests()
        .then((d) => setIncoming(Array.isArray(d) ? d : []))
        .catch(() => {}),
      api
        .getSentRequests()
        .then((d) => setSent(Array.isArray(d) ? d : []))
        .catch(() => {}),
      api
        .getAllRooms()
        .then((d) => setRooms(Array.isArray(d) ? d : []))
        .catch(() => {}),
    ]).then(() => setLoading(false));
  }, [setCachedMatchProfile]);

  const runSearch = useCallback(async (value: string) => {
    const term = value.trim();
    if (!term) {
      setSearchExtra([]);
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);
    try {
      const res = await api.getCandidatesBySkill(term);
      setSearchExtra(Array.isArray(res) ? res : []);
    } catch {
      setSearchExtra([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  // ── Debounced backend search ───────────────────────────────────────────────
  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!query.trim()) {
      void runSearch("");
      return;
    }

    debounceRef.current = setTimeout(async () => {
      await runSearch(query);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, runSearch]);

  // ── Merged + enriched + sorted candidates ─────────────────────────────────
  const enriched = useMemo<EnrichedCandidate[]>(() => {
    const q = normSkill(query);

    // Merge feed + backend search results, de-duplicate by user_id
    const seen = new Set<string>();
    const merged: MatchProfile[] = [];
    for (const c of [...candidates, ...searchExtra]) {
      if (!seen.has(c.user_id)) {
        seen.add(c.user_id);
        merged.push(c);
      }
    }

    // Frontend partial filter on top of merged list
    const filtered = q
      ? merged.filter(
          (c) =>
            normSkill(c.name).includes(q) ||
            c.i_have.some(
              (s) => normSkill(s).includes(q) || q.includes(normSkill(s)),
            ) ||
            c.i_want.some(
              (s) => normSkill(s).includes(q) || q.includes(normSkill(s)),
            ),
        )
      : merged;

    // Enrich with tier + overlap skills, then sort primary → tertiary
    const rich = enrichCandidates(filtered, myProfile);
    return [...rich].sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]);
  }, [candidates, searchExtra, query, myProfile]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const setLoadingId = (id: string, on: boolean) =>
    setLoadingIds((prev) => {
      const next = new Set(prev);
      if (on) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleSend = useCallback(async (userId: string) => {
    setLoadingId(userId, true);
    try {
      await api.sendExchangeRequest(userId);
      // Optimistic update
      setSent((prev) => [
        ...prev,
        {
          id: `opt-${Date.now()}`,
          from_user_id: "",
          to_user_id: userId,
          status: "pending",
          created_at: new Date().toISOString(),
        } as ExchangeRequest,
      ]);
    } catch (err) {
      console.error("[FindPage] sendRequest:", err);
    } finally {
      setLoadingId(userId, false);
    }
  }, []);

  const handleAccept = useCallback(
    async (requestId: string, fromUserId: string) => {
      setLoadingId(fromUserId, true);
      try {
        await api.acceptRequest(requestId);
        setIncoming((prev) =>
          prev.map((r) =>
            r.id === requestId ? { ...r, status: "accepted" } : r,
          ),
        );
      } catch (err) {
        console.error("[FindPage] acceptRequest:", err);
      } finally {
        setLoadingId(fromUserId, false);
      }
    },
    [],
  );

  // ── Derived display values ─────────────────────────────────────────────────
  const primaryCount = enriched.filter((c) => c.tier === "primary").length;
  // Feed is considered empty when: load finished, no active query, no results.
  const showFallback = !loading && !query.trim() && enriched.length === 0;
  // No match profile at all — show a dedicated setup prompt.
  const showSetupPrompt = showFallback && hasMatchProfile === false;

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-zinc-500 text-sm animate-pulse">Загрузка...</p>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">
      {/* ── Page header ── */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Найти навыки</h1>
        <p className="text-zinc-500 mt-1 text-sm">
          Найдите людей, с которыми можно обменяться знаниями
        </p>
      </div>

      {/* ── Search bar ── */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          clearTimeout(debounceRef.current);
          void runSearch(query);
        }}
        className="mb-5 flex gap-3"
      >
        <div className="relative flex-1">
          {/* Left icon */}
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
            <Search className="w-4 h-4 text-zinc-500" />
          </div>
          {/* Right: spinner or clear */}
          <div className="absolute inset-y-0 right-3.5 flex items-center gap-2">
            {searchLoading && (
              <div className="w-3.5 h-3.5 border-2 border-zinc-600 border-t-blue-400 rounded-full animate-spin" />
            )}
            {query && !searchLoading && (
              <button
                onClick={() => setQuery("")}
                className="text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Go, Python, Figma, дизайн..."
            className="w-full rounded-xl border border-white/5 bg-zinc-800/70 pl-10 pr-10 py-3 text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500/60 focus:outline-none focus:ring-2 focus:ring-blue-500/10"
          />
        </div>

        <button
          type="submit"
          className="flex shrink-0 items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
          disabled={searchLoading}
        >
          <Search className="h-4 w-4" />
          <span className="hidden sm:inline">Найти</span>
        </button>
      </form>

      {/* ── Summary line ── */}
      {!showFallback && enriched.length > 0 && (
        <div className="flex items-center gap-3 mb-5 min-h-[1.5rem]">
          {query.trim() ? (
            <p className="text-xs text-zinc-600">
              Найдено:{" "}
              <span className="text-zinc-400 font-medium">
                {enriched.length}
              </span>
            </p>
          ) : (
            <p className="text-xs text-zinc-600">
              <span className="text-zinc-400 font-medium">
                {enriched.length}
              </span>{" "}
              рекомендаций
              {primaryCount > 0 && (
                <span className="ml-2 text-amber-400 font-medium">
                  · ⚡ {primaryCount} идеальных мэтча
                </span>
              )}
            </p>
          )}
        </div>
      )}

      {/* ── Content ── */}
      {showSetupPrompt ? (
        /*
         * User has NO match profile yet.
         * getCandidates returned a 404 and we caught it above.
         * Show a clear call-to-action instead of a generic empty state.
          */
        <div className="py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-blue-600/10 border border-blue-600/20 flex items-center justify-center mx-auto mb-4">
            <Search className="w-7 h-7 text-blue-400" />
          </div>
          <h3 className="font-semibold text-zinc-100 mb-2">
            Настройте профиль обмена
          </h3>
          <p className="text-sm text-zinc-500 max-w-sm mx-auto leading-relaxed mb-6">
            Укажите навыки, которым вы можете обучить других, и то, что хотите
            изучить сами — и мы подберём подходящих партнёров.
          </p>
          <a
            href="/dashboard/edit-profile"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
          >
            <Zap className="w-4 h-4" />
            Заполнить профиль
          </a>
          <p className="text-xs text-zinc-600 mt-4">
            Или поищите по навыку, чтобы изучить, кто уже есть на платформе:
          </p>
          <div className="flex flex-wrap justify-center gap-2 mt-3">
            {TRENDING_SKILLS.slice(0, 6).map((skill) => (
              <button
                key={skill}
                onClick={() => setQuery(skill)}
                className="rounded-full border border-white/10 bg-zinc-800/60 text-zinc-300 hover:border-blue-500/40 hover:text-blue-400 hover:bg-blue-500/10 transition-colors text-sm px-3 py-1.5"
              >
                {skill}
              </button>
            ))}
          </div>
        </div>
      ) : showFallback ? (
        /* Profile exists but no matches yet → trending skills discovery */
        <TrendingFallback onSearch={(skill) => setQuery(skill)} />
      ) : enriched.length === 0 ? (
        /* Query returned nothing */
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-white/5 flex items-center justify-center mb-4">
            <PackageSearch className="w-7 h-7 text-zinc-600" />
          </div>
          <p className="text-zinc-300 font-semibold text-base">
            Никого не найдено
          </p>
          <p className="text-zinc-600 text-sm mt-1.5 max-w-xs leading-relaxed">
            Попробуйте изменить запрос или добавьте больше навыков в свой
            профиль.
          </p>
          {query.trim() && (
            <button
              onClick={() => setQuery("")}
              className="mt-4 text-sm text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors"
            >
              Сбросить поиск
            </button>
          )}
        </div>
      ) : (
        /* Candidate grid */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {enriched.map((candidate) => {
            const connState = getConnectionState(
              candidate.user_id,
              incoming,
              sent,
              rooms,
            );
            const pendingReq = incoming.find(
              (r) =>
                r.from_user_id === candidate.user_id && r.status === "pending",
            );
            return (
              <CandidateCard
                key={candidate.user_id}
                candidate={candidate}
                connState={connState}
                isLoading={loadingIds.has(candidate.user_id)}
                myProfile={myProfile}
                onSend={() => handleSend(candidate.user_id)}
                onAccept={() =>
                  pendingReq && handleAccept(pendingReq.id, candidate.user_id)
                }
                onGoToChats={() => router.push("/dashboard/chats")}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
