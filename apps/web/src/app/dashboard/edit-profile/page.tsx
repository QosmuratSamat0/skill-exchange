"use client";

import { useEffect, useState } from "react";
import { Plus, X, User, Save } from "lucide-react";
import { api } from "@/lib/api";
import { useChatStore } from "@/store/chatStore";
import type { MatchProfile } from "@/types/index";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EditProfilePage() {
  const setMyUserProfile = useChatStore((state) => state.setMyUserProfile);
  const setMyMatchProfile = useChatStore((state) => state.setMyMatchProfile);

  // Basic info
  const [name, setName] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");

  // Skills
  const [teachSkills, setTeachSkills] = useState<string[]>([]);
  const [learnSkills, setLearnSkills] = useState<string[]>([]);
  const [teachInput, setTeachInput] = useState("");
  const [learnInput, setLearnInput] = useState("");

  // Async state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState("");

  // ── Mount ────────────────────────────────────────────────────────────────

  useEffect(() => {
    async function loadProfiles() {
      try {
        const [userProfile, matchProfile] = await Promise.all([
          api.getMyUserProfile().catch(() => null),
          api.getMatchProfile().catch(() => null),
        ]);

        if (userProfile) {
          setMyUserProfile(userProfile);
          setName(userProfile.name ?? "");
          setBio(userProfile.bio ?? "");
          // contact_number was missing from the load — user always saw a blank field
          setContactNumber(userProfile.contact_number ?? "");
        }

        if (matchProfile) {
          setMyMatchProfile(matchProfile);
          setName((current) => current || matchProfile.name || "");
          setBio((current) => current || matchProfile.bio || "");
          setTeachSkills(
            Array.isArray(matchProfile.i_have) ? matchProfile.i_have : [],
          );
          setLearnSkills(
            Array.isArray(matchProfile.i_want) ? matchProfile.i_want : [],
          );
          return;
        }

        setMyMatchProfile(null);
        if (userProfile) {
          setTeachSkills(
            Array.isArray(userProfile.teach_skills)
              ? userProfile.teach_skills
              : [],
          );
          setLearnSkills(
            Array.isArray(userProfile.learn_skills)
              ? userProfile.learn_skills
              : [],
          );
        }
      } finally {
        setLoading(false);
      }
    }

    void loadProfiles();
  }, [setMyMatchProfile, setMyUserProfile]);

  // ── Skill handlers ───────────────────────────────────────────────────────

  function handleAddTeach() {
    const trimmed = teachInput.trim();
    if (!trimmed) return;
    setTeachSkills((prev) => [...prev, trimmed]);
    setTeachInput("");
  }

  function handleAddLearn() {
    const trimmed = learnInput.trim();
    if (!trimmed) return;
    setLearnSkills((prev) => [...prev, trimmed]);
    setLearnInput("");
  }

  function handleRemoveTeach(i: number) {
    setTeachSkills((prev) => prev.filter((_, idx) => idx !== i));
  }

  function handleRemoveLearn(i: number) {
    setLearnSkills((prev) => prev.filter((_, idx) => idx !== i));
  }

  // ── Save ─────────────────────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true);
    setSaveSuccess(false);
    setSaveError("");
    try {
      if (teachSkills.length === 0 || learnSkills.length === 0) {
        setSaveError(
          "Добавьте хотя бы один навык в оба раздела профиля обмена.",
        );
        return;
      }

      // Load current profile first to preserve server-managed fields
      // (rating, review_count) that this form doesn't display or control.
      // Sending 0 for rating would silently wipe a user's real rating.
      const current = await api.getMyUserProfile().catch(() => null);
      const userProfilePayload = {
        name,
        avatar: current?.avatar ?? "",
        bio,
        contact_number: contactNumber,
        teach_skills: teachSkills,
        learn_skills: learnSkills,
        // Preserve protected fields from the live record
        rating: current?.rating ?? 0,
        review_count: current?.review_count ?? 0,
      };
      await api.updateUserProfile(userProfilePayload);
      const refreshedUserProfile = await api
        .getMyUserProfile()
        .catch(() => null);
      setMyUserProfile(
        refreshedUserProfile ?? {
          user_id: current?.user_id ?? "",
          updated_at: current?.updated_at ?? new Date().toISOString(),
          ...userProfilePayload,
        },
      );

      const matchProfilePayload: Partial<MatchProfile> = {
        name: name.trim() || current?.name || "Пользователь",
        i_have: teachSkills,
        i_want: learnSkills,
        bio,
      };
      await api.updateMatchProfile(matchProfilePayload);

      const refreshedMatchProfile =
        (await api.getMatchProfile().catch(() => null)) ??
        ({
          user_id: "",
          updated_at: new Date().toISOString(),
          ...matchProfilePayload,
        } as MatchProfile);
      setMyMatchProfile(refreshedMatchProfile);
      setSaveSuccess(true);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Не удалось сохранить профиль.";
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  }

  // ── Derived ──────────────────────────────────────────────────────────────

  const initials = name
    ? name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-6 md:p-8 max-w-2xl mx-auto">
        <p className="text-sm text-zinc-500">Загрузка профиля…</p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-2xl mx-auto">
      {/* ── Avatar / heading ─────────────────────────────────────────── */}
      <div className="flex items-center gap-5 mb-8">
        <div className="w-20 h-20 rounded-full bg-blue-600/20 border-2 border-blue-600/30 flex items-center justify-center text-blue-400 text-2xl font-bold select-none">
          {initials}
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">
            {name || "Мой профиль"}
          </h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Редактировать информацию профиля
          </p>
        </div>
      </div>

      <div className="space-y-5">
        {/* ── Basic info card ───────────────────────────────────────── */}
        <div className="rounded-2xl border border-white/5 bg-zinc-900 p-6 space-y-5">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-zinc-400" />
            <h2 className="font-semibold text-zinc-100">Основная информация</h2>
          </div>

          {/* Name */}
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">
              Имя
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ваше имя"
              className="mt-1.5 w-full rounded-xl border border-white/5 bg-zinc-800/70 px-4 py-3 text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500/60 focus:outline-none focus:ring-2 focus:ring-blue-500/10"
            />
          </div>

          {/* Contact number */}
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">
              Контактный номер
            </label>
            <input
              type="tel"
              value={contactNumber}
              onChange={(e) => setContactNumber(e.target.value)}
              placeholder="+7 (___) ___-__-__"
              className="mt-1.5 w-full rounded-xl border border-white/5 bg-zinc-800/70 px-4 py-3 text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500/60 focus:outline-none focus:ring-2 focus:ring-blue-500/10"
            />
          </div>

          {/* Location */}
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">
              Город
            </label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Алматы, Казахстан"
              className="mt-1.5 w-full rounded-xl border border-white/5 bg-zinc-800/70 px-4 py-3 text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500/60 focus:outline-none focus:ring-2 focus:ring-blue-500/10"
            />
          </div>

          {/* Bio */}
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">
              О себе
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              placeholder="Расскажите о себе..."
              className="mt-1.5 w-full rounded-xl border border-white/5 bg-zinc-800/70 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500/60 focus:outline-none focus:ring-2 focus:ring-blue-500/10 resize-none"
            />
          </div>
        </div>

        {/* ── Teach skills card ─────────────────────────────────────── */}
        <div className="rounded-2xl border border-white/5 bg-zinc-900 p-6">
          <h2 className="font-semibold text-zinc-100 mb-1">Могу научить</h2>
          <p className="text-xs text-zinc-500 mb-4">
            Навыки, которыми вы готовы поделиться
          </p>

          {/* Existing tags */}
          <div className="flex flex-wrap gap-2 mb-4 min-h-[32px]">
            {teachSkills.length === 0 ? (
              <p className="text-xs text-zinc-600">Добавьте навыки ниже</p>
            ) : (
              teachSkills.map((skill, i) => (
                <span
                  key={i}
                  className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs px-3 py-1.5"
                >
                  {skill}
                  <button
                    type="button"
                    onClick={() => handleRemoveTeach(i)}
                    className="text-emerald-400/60 hover:text-emerald-300 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))
            )}
          </div>

          {/* Add skill */}
          <div className="flex gap-2">
            <input
              type="text"
              value={teachInput}
              onChange={(e) => setTeachInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddTeach();
                }
              }}
              placeholder="Введите навык..."
              className="flex-1 rounded-xl border border-white/5 bg-zinc-800/70 px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500/60 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleAddTeach}
              disabled={!teachInput.trim()}
              className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-40 transition-colors flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Добавить
            </button>
          </div>
        </div>

        {/* ── Learn skills card ─────────────────────────────────────── */}
        <div className="rounded-2xl border border-white/5 bg-zinc-900 p-6">
          <h2 className="font-semibold text-zinc-100 mb-1">Хочу научиться</h2>
          <p className="text-xs text-zinc-500 mb-4">
            Навыки, которые вы хотите освоить
          </p>

          {/* Existing tags */}
          <div className="flex flex-wrap gap-2 mb-4 min-h-[32px]">
            {learnSkills.length === 0 ? (
              <p className="text-xs text-zinc-600">Добавьте навыки ниже</p>
            ) : (
              learnSkills.map((skill, i) => (
                <span
                  key={i}
                  className="flex items-center gap-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs px-3 py-1.5"
                >
                  {skill}
                  <button
                    type="button"
                    onClick={() => handleRemoveLearn(i)}
                    className="text-blue-400/60 hover:text-blue-300 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))
            )}
          </div>

          {/* Add skill */}
          <div className="flex gap-2">
            <input
              type="text"
              value={learnInput}
              onChange={(e) => setLearnInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddLearn();
                }
              }}
              placeholder="Введите навык..."
              className="flex-1 rounded-xl border border-white/5 bg-zinc-800/70 px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500/60 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleAddLearn}
              disabled={!learnInput.trim()}
              className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40 transition-colors flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Добавить
            </button>
          </div>
        </div>

        {/* ── Save button row ───────────────────────────────────────── */}
        <div className="mt-6 flex items-center gap-4">
          {saveSuccess && (
            <p className="text-sm text-emerald-400">Профиль сохранён!</p>
          )}
          {saveError && <p className="text-sm text-red-400">{saveError}</p>}
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-blue-600 px-8 py-3 font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors ml-auto flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            {saving ? "Сохранение..." : "Сохранить профиль"}
          </button>
        </div>
      </div>
    </div>
  );
}
