"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { SkillTag } from "@/components/SkillTag";
import { StatsBar } from "@/components/StatsBar";
import type {
  UserProfile,
  MatchStats,
  Review,
  UserSession,
} from "@/types/index";
import {
  ChevronLeft,
  User,
  Star,
  Shield,
  Trash2,
  Monitor,
  LogOut,
  Lock,
  Eye,
  EyeOff,
  AlertTriangle,
  Phone,
} from "lucide-react";
import { clsx } from "clsx";

// ─── Star rating display ──────────────────────────────────────────────────────
function StarRating({ rating, max = 5 }: { rating: number; max?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <Star
          key={i}
          className={clsx(
            "w-4 h-4",
            i < Math.round(rating)
              ? "text-yellow-400 fill-yellow-400"
              : "text-zinc-700 fill-zinc-700",
          )}
        />
      ))}
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────
function Section({
  title,
  icon,
  children,
  danger,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <section
      className={clsx("sleek-card space-y-5", danger && "border-red-500/20")}
    >
      <div className="flex items-center gap-2.5">
        <span
          className={clsx(
            "shrink-0",
            danger ? "text-red-400" : "text-blue-400",
          )}
        >
          {icon}
        </span>
        <h2
          className={clsx("font-semibold text-base", danger && "text-red-400")}
        >
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const router = useRouter();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<MatchStats | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [loading, setLoading] = useState(true);

  // Password form
  const [pwForm, setPwForm] = useState({ old: "", newPw: "", confirm: "" });
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  // Delete form
  const [deleteForm, setDeleteForm] = useState({ password: "", reason: "" });
  const [deleteError, setDeleteError] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  useEffect(() => {
    const load = async () => {
      const token = localStorage.getItem("access_token");
      if (!token || token === "undefined" || token === "null") {
        router.push("/auth");
        return;
      }
      try {
        const [p, s, sess] = await Promise.all([
          api.getMyUserProfile().catch(() => null),
          api.getMyStats().catch(() => null),
          api.getSessions().catch(() => [] as UserSession[]),
        ]);
        setProfile(p);
        setStats(s);
        setSessions(Array.isArray(sess) ? sess : []);
        if (p) {
          const r = await api.getReviews(p.user_id).catch(() => []);
          setReviews(Array.isArray(r) ? r : []);
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [router]);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError("");
    setPwSuccess(false);
    if (pwForm.newPw !== pwForm.confirm) {
      setPwError("Пароли не совпадают");
      return;
    }
    if (pwForm.newPw.length < 8) {
      setPwError("Пароль должен содержать минимум 8 символов");
      return;
    }
    setPwLoading(true);
    try {
      await api.changePassword(pwForm.old, pwForm.newPw);
      setPwSuccess(true);
      setPwForm({ old: "", newPw: "", confirm: "" });
    } catch (e: unknown) {
      setPwError(e instanceof Error ? e.message : "Ошибка смены пароля");
    } finally {
      setPwLoading(false);
    }
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteError("");
    setDeleteLoading(true);
    try {
      await api.deleteAccount(
        deleteForm.password,
        deleteForm.reason || undefined,
      );
      localStorage.clear();
      router.push("/");
    } catch (e: unknown) {
      setDeleteError(
        e instanceof Error ? e.message : "Ошибка удаления аккаунта",
      );
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      const rt = localStorage.getItem("refresh_token");
      if (rt) await api.logout(rt).catch(() => null);
    } finally {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      router.push("/");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="text-zinc-600 text-sm animate-pulse">Загрузка...</div>
      </div>
    );
  }

  const initials = profile?.name
    ? profile.name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "??";

  return (
    <main className="min-h-screen bg-[#050505] text-white pb-16">
      {/* ── Header ── */}
      <header className="sticky top-0 z-20 bg-[#050505]/90 backdrop-blur-md border-b border-white/5 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link
            href="/search"
            className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
            <span className="text-sm">Назад</span>
          </Link>
          <h1 className="font-semibold">Мой профиль</h1>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-red-400 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Выйти
          </button>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 pt-8 space-y-6">
        {/* ── Profile info ── */}
        <Section
          title="Информация о профиле"
          icon={<User className="w-5 h-5" />}
        >
          <div className="flex items-start gap-5">
            {profile?.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatar}
                alt={profile.name}
                className="w-20 h-20 rounded-2xl object-cover border border-white/5 shrink-0"
              />
            ) : (
              <div className="w-20 h-20 bg-gradient-to-br from-blue-600/20 to-purple-600/20 border border-white/5 rounded-2xl flex items-center justify-center text-2xl font-bold text-blue-400 shrink-0 select-none">
                {initials}
              </div>
            )}
            <div className="space-y-1.5 min-w-0">
              <h3 className="text-xl font-bold">
                {profile?.name || "Без имени"}
              </h3>
              {profile?.bio && (
                <p className="text-sm text-zinc-400 leading-relaxed">
                  {profile.bio}
                </p>
              )}
              {/* ── Contact number ── */}
              {profile?.contact_number && (
                <div className="flex items-center gap-1.5 text-sm text-zinc-400">
                  <Phone className="w-3.5 h-3.5 shrink-0 text-zinc-500" />
                  <span>{profile.contact_number}</span>
                </div>
              )}
              <div className="flex items-center gap-3 flex-wrap">
                {profile && profile.rating > 0 && (
                  <div className="flex items-center gap-2">
                    <StarRating rating={profile.rating} />
                    <span className="text-sm text-zinc-400">
                      {profile.rating.toFixed(1)} ({profile.review_count}{" "}
                      отзывов)
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Section>

        {/* ── Skills ── */}
        {profile?.teach_skills?.length || profile?.learn_skills?.length ? (
          <Section title="Навыки" icon={<Star className="w-5 h-5" />}>
            <div className="space-y-4">
              {profile?.teach_skills?.length ? (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                    Могу научить
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.teach_skills.map((s) => (
                      <SkillTag key={s} skill={s} variant="teach" />
                    ))}
                  </div>
                </div>
              ) : null}
              {profile?.learn_skills?.length ? (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                    Хочу научиться
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.learn_skills.map((s) => (
                      <SkillTag key={s} skill={s} variant="learn" />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </Section>
        ) : null}

        {/* ── Stats ── */}
        <Section title="Статистика" icon={<Shield className="w-5 h-5" />}>
          <StatsBar stats={stats} />
          {stats && (
            <div className="grid grid-cols-3 gap-3 mt-2">
              <div className="bg-zinc-900/60 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-white">
                  {stats.total_matches}
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">Всего</p>
              </div>
              <div className="bg-zinc-900/60 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-green-400">
                  {stats.accepted_count}
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">Принято</p>
              </div>
              <div className="bg-zinc-900/60 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-zinc-400">
                  {stats.declined_count}
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">Отклонено</p>
              </div>
            </div>
          )}
        </Section>

        {/* ── Reviews ── */}
        <Section title="Отзывы" icon={<Star className="w-5 h-5" />}>
          {reviews.length === 0 ? (
            <p className="text-sm text-zinc-600">Отзывов пока нет</p>
          ) : (
            <div className="space-y-3">
              {reviews.map((r) => (
                <div
                  key={r.id}
                  className="bg-zinc-900/60 rounded-xl p-4 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-zinc-500 font-mono">
                      {r.from_user_id.slice(0, 12)}…
                    </p>
                    <StarRating rating={r.rating} />
                  </div>
                  {r.comment && (
                    <p className="text-sm text-zinc-300 leading-relaxed">
                      {r.comment}
                    </p>
                  )}
                  <p className="text-[10px] text-zinc-600">
                    {new Date(r.created_at).toLocaleDateString("ru-RU")}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* ── Sessions ── */}
        <Section title="Активные сессии" icon={<Monitor className="w-5 h-5" />}>
          {sessions.length === 0 ? (
            <p className="text-sm text-zinc-600">Нет активных сессий</p>
          ) : (
            <div className="space-y-2">
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between bg-zinc-900/60 rounded-xl p-3"
                >
                  <div className="space-y-0.5 min-w-0">
                    <p className="text-sm text-zinc-300 truncate">
                      {s.user_agent
                        ? s.user_agent.slice(0, 60)
                        : "Неизвестное устройство"}
                    </p>
                    <p className="text-xs text-zinc-600">
                      {s.ip ?? "—"} · Истекает{" "}
                      {new Date(s.expires_at).toLocaleDateString("ru-RU")}
                    </p>
                  </div>
                  <span className="ml-3 shrink-0 w-2 h-2 bg-emerald-500 rounded-full" />
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* ── Change password ── */}
        <Section title="Смена пароля" icon={<Lock className="w-5 h-5" />}>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                placeholder="Текущий пароль"
                value={pwForm.old}
                onChange={(e) => setPwForm({ ...pwForm, old: e.target.value })}
                className="sleek-input w-full pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors"
              >
                {showPw ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
            <input
              type={showPw ? "text" : "password"}
              placeholder="Новый пароль (мин. 8 символов)"
              value={pwForm.newPw}
              onChange={(e) => setPwForm({ ...pwForm, newPw: e.target.value })}
              className="sleek-input w-full"
              required
            />
            <input
              type={showPw ? "text" : "password"}
              placeholder="Подтвердите новый пароль"
              value={pwForm.confirm}
              onChange={(e) =>
                setPwForm({ ...pwForm, confirm: e.target.value })
              }
              className="sleek-input w-full"
              required
            />
            {pwError && <p className="text-sm text-red-400">{pwError}</p>}
            {pwSuccess && (
              <p className="text-sm text-green-400">Пароль успешно изменён</p>
            )}
            <button
              type="submit"
              disabled={pwLoading}
              className="sleek-button w-full disabled:opacity-50"
            >
              {pwLoading ? "Сохраняю..." : "Изменить пароль"}
            </button>
          </form>
        </Section>

        {/* ── Danger zone ── */}
        <Section
          title="Опасная зона"
          icon={<AlertTriangle className="w-5 h-5" />}
          danger
        >
          {!deleteConfirm ? (
            <div className="space-y-3">
              <p className="text-sm text-zinc-400">
                Удаление аккаунта — необратимая операция. Все данные будут
                стёрты навсегда.
              </p>
              <button
                onClick={() => setDeleteConfirm(true)}
                className="flex items-center gap-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-red-500/20 transition-all"
              >
                <Trash2 className="w-4 h-4" />
                Удалить аккаунт
              </button>
            </div>
          ) : (
            <form onSubmit={handleDeleteAccount} className="space-y-4">
              <p className="text-sm text-red-400 font-medium">
                Вы уверены? Введите пароль для подтверждения.
              </p>
              <input
                type="password"
                placeholder="Ваш пароль"
                value={deleteForm.password}
                onChange={(e) =>
                  setDeleteForm({ ...deleteForm, password: e.target.value })
                }
                className="sleek-input w-full border-red-500/20 focus:ring-red-500/30"
                required
              />
              <input
                type="text"
                placeholder="Причина удаления (необязательно)"
                value={deleteForm.reason}
                onChange={(e) =>
                  setDeleteForm({ ...deleteForm, reason: e.target.value })
                }
                className="sleek-input w-full border-red-500/20 focus:ring-red-500/30"
              />
              {deleteError && (
                <p className="text-sm text-red-400">{deleteError}</p>
              )}
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={deleteLoading}
                  className="flex-1 bg-red-600 text-white font-semibold rounded-xl py-3 hover:brightness-110 disabled:opacity-50 transition-all"
                >
                  {deleteLoading ? "Удаляю..." : "Удалить навсегда"}
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(false)}
                  className="sleek-button-secondary flex-1"
                >
                  Отмена
                </button>
              </div>
            </form>
          )}
        </Section>
      </div>
    </main>
  );
}
