"use client";

import { useState, useEffect } from "react";
import { Users, Zap } from "lucide-react";
import { clsx } from "clsx";
import { api } from "@/lib/api";
import type { MatchStats, UserProfile } from "@/types/index";

// ─── Metric Card ─────────────────────────────────────────────────────────────
function MetricCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-2xl border border-white/5 bg-zinc-900 p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-zinc-500 mt-1">{label}</p>
          <p className="text-4xl font-bold text-white mt-2">{value}</p>
        </div>
        <div className="w-10 h-10 rounded-full bg-blue-600/20 border border-blue-600/30 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-blue-400" />
        </div>
      </div>
    </div>
  );
}

// ─── Toggle Row ───────────────────────────────────────────────────────────────
function ToggleRow({
  label,
  description,
  enabled,
  onToggle,
  disabled,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-zinc-200">{label}</p>
        <p className="text-xs text-zinc-500 mt-0.5">{description}</p>
      </div>
      <button
        onClick={onToggle}
        disabled={disabled}
        aria-pressed={enabled}
        className={clsx(
          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed",
          enabled ? "bg-blue-600" : "bg-zinc-700",
        )}
      >
        <span
          className={clsx(
            "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
            enabled ? "translate-x-5" : "translate-x-0",
          )}
        />
      </button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [stats, setStats] = useState<MatchStats | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [prefSaving, setPrefSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [s, p] = await Promise.all([
          api.getMyStats(),
          api.getMyUserProfile(),
        ]);
        setStats(s);
        setProfile(p);
        // Initialize toggle from the saved preference (default true if not set)
        setEmailNotifs(p.email_notifications_enabled ?? true);
      } catch (err) {
        console.error("[DashboardPage] load error:", err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const handleEmailToggle = async () => {
    const next = !emailNotifs;
    setEmailNotifs(next); // optimistic update
    setPrefSaving(true);
    try {
      await api.updateEmailPreferences(next);
    } catch (err) {
      console.error("[DashboardPage] failed to save email preference:", err);
      setEmailNotifs(!next); // revert on error
    } finally {
      setPrefSaving(false);
    }
  };

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-zinc-500 text-sm animate-pulse">Загрузка...</p>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      {/* ── Header ── */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">
          Добро пожаловать,{" "}
          <span className="text-blue-400">
            {profile?.name ?? "Пользователь"}
          </span>
        </h1>
        <p className="text-zinc-500 mt-1 text-sm">
          Ваш центр управления обменом навыками
        </p>
      </div>

      {/* ── Metrics grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <MetricCard
          label="Всего связей"
          value={stats?.total_matches ?? 0}
          icon={Users}
        />
        <MetricCard
          label="Обменено навыков"
          value={stats?.accepted_count ?? 0}
          icon={Zap}
        />
      </div>

      {/* ── Notification prefs ── */}
      <div className="rounded-2xl border border-white/5 bg-zinc-900 p-6">
        <h2 className="text-base font-semibold text-white mb-5">
          Настройки уведомлений
        </h2>

        <div className="space-y-4">
          <ToggleRow
            label="Email уведомления"
            description="Получайте уведомления на почту"
            enabled={emailNotifs}
            onToggle={handleEmailToggle}
            disabled={prefSaving}
          />
        </div>
      </div>
    </div>
  );
}
