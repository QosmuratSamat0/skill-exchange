"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Monitor,
  ChevronDown,
  ChevronUp,
  Shield,
  HelpCircle,
  Flag,
  Trash2,
} from "lucide-react";
import { api } from "@/lib/api";
import type { UserSession } from "@/types/index";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
  });
}

const faqs = [
  {
    id: "faq1",
    q: "Как работает обмен навыками?",
    a: "Вы создаёте профиль обмена, указывая что умеете и что хотите изучить. Система подбирает партнёров с совпадающими навыками, после чего вы можете отправить запрос на обмен.",
  },
  {
    id: "faq2",
    q: "Как удалить аккаунт?",
    a: "Вы можете удалить аккаунт в разделе ниже. Все данные будут удалены без возможности восстановления. Требуется подтверждение паролем.",
  },
  {
    id: "faq3",
    q: "Что делать, если партнёр ведёт себя неприемлемо?",
    a: "Используйте форму жалобы ниже, чтобы сообщить о нарушителе. Наша команда рассмотрит жалобу в течение 24 часов.",
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const router = useRouter();

  // Sessions
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [loading, setLoading] = useState(true);

  // FAQ
  const [openFaq, setOpenFaq] = useState<string | null>(null);

  // Report
  const [reportText, setReportText] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);

  // Delete account modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // ── Mount ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    api
      .getSessions()
      .then(setSessions)
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, []);

  // ── Handlers ───────────────────────────────────────────────────────────────

  async function handleLogoutAll() {
    try {
      await api.logoutAll();
    } catch {
      // best-effort
    } finally {
      localStorage.clear();
      router.push("/auth");
    }
  }

  async function handleReport() {
    if (!reportText.trim()) return;
    setReportSubmitting(true);
    try {
      await api.reportUser("general", "unknown", reportText);
    } catch {
      // show success regardless (demo)
    } finally {
      setReportSuccess(true);
      setReportText("");
      setReportSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deletePassword) return;
    setDeleteLoading(true);
    setDeleteError("");
    try {
      await api.deleteAccount(deletePassword, deleteReason || undefined);
      localStorage.clear();
      router.push("/");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Не удалось удалить аккаунт.";
      setDeleteError(message);
    } finally {
      setDeleteLoading(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">

      {/* ── Section 1: Session Activity ─────────────────────────────────── */}
      <div className="rounded-2xl border border-white/5 bg-zinc-900 p-6">
        <div className="flex items-center gap-2 mb-5">
          <Shield className="w-4 h-4 text-zinc-400" />
          <h2 className="font-semibold text-zinc-100">Активные сессии</h2>
        </div>

        {loading ? (
          <p className="text-sm text-zinc-500">Загрузка сессий…</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-zinc-500">Сессии не найдены.</p>
        ) : (
          <div>
            {sessions.map((session) => (
              <div
                key={session.id}
                className="flex items-start justify-between gap-4 py-3 border-b border-white/5 last:border-0"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-zinc-800 border border-white/5 flex items-center justify-center">
                    <Monitor className="w-4 h-4 text-zinc-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-200 truncate max-w-[200px]">
                      {session.user_agent.split("/")[0]}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {session.ip} · {formatDate(session.created_at)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-white/5">
          <button
            onClick={handleLogoutAll}
            className="rounded-lg border border-white/5 bg-zinc-900 px-5 py-2.5 font-medium text-zinc-200 hover:bg-zinc-800 transition-colors text-sm"
          >
            Завершить все сессии
          </button>
        </div>
      </div>

      {/* ── Section 2: Help & Support (FAQ Accordion) ──────────────────── */}
      <div className="rounded-2xl border border-white/5 bg-zinc-900 p-6">
        <div className="flex items-center gap-2 mb-4">
          <HelpCircle className="w-4 h-4 text-zinc-400" />
          <h2 className="font-semibold text-zinc-100">Помощь и поддержка</h2>
        </div>

        <div>
          {faqs.map((faq) => (
            <div key={faq.id} className="border-b border-white/5 last:border-0">
              <button
                onClick={() =>
                  setOpenFaq(openFaq === faq.id ? null : faq.id)
                }
                className="flex items-center justify-between w-full py-4 text-left"
              >
                <span className="text-sm font-medium text-zinc-200">
                  {faq.q}
                </span>
                {openFaq === faq.id ? (
                  <ChevronUp className="w-4 h-4 text-zinc-500 shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" />
                )}
              </button>
              {openFaq === faq.id && (
                <p className="text-sm text-zinc-500 pb-4 leading-relaxed">
                  {faq.a}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Section 3: Report Suspicious Behavior ──────────────────────── */}
      <div className="rounded-2xl border border-white/5 bg-zinc-900 p-6">
        <div className="flex items-center gap-2 mb-1">
          <Flag className="w-4 h-4 text-zinc-400" />
          <h2 className="font-semibold text-zinc-100">
            Пожаловаться на пользователя
          </h2>
        </div>
        <p className="text-sm text-zinc-500 mb-4">
          Опишите ситуацию подробно. Мы рассмотрим вашу жалобу в течение 24
          часов.
        </p>
        <textarea
          value={reportText}
          onChange={(e) => setReportText(e.target.value)}
          rows={4}
          placeholder="Опишите нарушение..."
          className="w-full rounded-xl border border-white/5 bg-zinc-800/70 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500/60 focus:outline-none focus:ring-2 focus:ring-blue-500/10 resize-none"
        />
        {reportSuccess && (
          <p className="text-sm text-emerald-400 mt-2">
            Жалоба отправлена. Спасибо!
          </p>
        )}
        <button
          onClick={handleReport}
          disabled={!reportText.trim() || reportSubmitting}
          className="mt-3 rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-sm text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
        >
          {reportSubmitting ? "Отправка..." : "Отправить жалобу"}
        </button>
      </div>

      {/* ── Section 4: Danger Zone ─────────────────────────────────────── */}
      <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 mt-6">
        <div className="flex items-center gap-2 mb-1">
          <Trash2 className="w-4 h-4 text-red-400" />
          <h2 className="font-semibold text-red-400">Удалить аккаунт</h2>
        </div>
        <p className="text-sm text-zinc-500 mb-4">
          Это действие необратимо. Все ваши данные будут удалены навсегда.
        </p>
        <button
          onClick={() => setShowDeleteModal(true)}
          className="rounded-lg border border-red-500/30 bg-transparent px-5 py-2.5 font-medium text-sm text-red-400 hover:bg-red-500/10 transition-colors"
        >
          Удалить аккаунт
        </button>
      </div>

      {/* ── Delete Account Modal ────────────────────────────────────────── */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900 p-6 shadow-2xl">
            <h3 className="font-semibold text-white mb-2">
              Подтвердите удаление
            </h3>
            <p className="text-sm text-zinc-500 mb-5">
              Введите пароль для подтверждения. Это действие нельзя отменить.
            </p>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                  Пароль
                </label>
                <input
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="Ваш пароль"
                  className="mt-1.5 w-full rounded-xl border border-white/5 bg-zinc-800/70 px-4 py-3 text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500/60 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                  Причина (необязательно)
                </label>
                <textarea
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  rows={2}
                  placeholder="Расскажите, почему уходите..."
                  className="mt-1.5 w-full rounded-xl border border-white/5 bg-zinc-800/70 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500/60 focus:outline-none resize-none"
                />
              </div>
              {deleteError && (
                <p className="text-sm text-red-400">{deleteError}</p>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteError("");
                }}
                className="flex-1 rounded-lg border border-white/5 bg-zinc-800 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-700 transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={handleDelete}
                disabled={!deletePassword || deleteLoading}
                className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50 transition-colors"
              >
                {deleteLoading ? "Удаление..." : "Удалить навсегда"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
