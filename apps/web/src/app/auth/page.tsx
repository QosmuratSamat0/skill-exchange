"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import {
  Sparkles,
  Eye,
  EyeOff,
  ChevronLeft,
  Mail,
  Lock,
  User,
  Phone,
  Plus,
  X,
} from "lucide-react";
import { clsx } from "clsx";

type AuthTab = "login" | "register";

// ─── Reusable icon-input wrapper ─────────────────────────────────────────────
// Using the absolute-inset pattern + pl-10 directly on <input> so there is
// zero risk of a CSS-specificity conflict with any global utility class.
const INPUT_CLS =
  "w-full rounded-xl border border-white/5 bg-zinc-800/70 py-3 text-zinc-100 " +
  "placeholder:text-zinc-500 transition-colors focus:border-blue-500/60 " +
  "focus:outline-none focus:ring-2 focus:ring-blue-500/10";

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AuthPage() {
  const router = useRouter();
  const [tab, setTab] = useState<AuthTab>("login");

  // ── Login state ─────────────────────────────────────────────────────────────
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // ── Register state ──────────────────────────────────────────────────────────
  const [regForm, setRegForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    password: "",
    confirm: "",
  });
  const [teachSkills, setTeachSkills] = useState<string[]>([]);
  const [learnSkills, setLearnSkills] = useState<string[]>([]);
  const [teachInput, setTeachInput] = useState("");
  const [learnInput, setLearnInput] = useState("");
  const [regError, setRegError] = useState("");
  const [regLoading, setRegLoading] = useState(false);
  const [regSuccess, setRegSuccess] = useState(false);
  const [regWarn, setRegWarn] = useState(""); // non-fatal save warning

  // ── Shared ──────────────────────────────────────────────────────────────────
  const [showPassword, setShowPassword] = useState(false);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const storeTokens = (access: string, refresh?: string) => {
    localStorage.setItem("access_token", access);
    if (refresh) localStorage.setItem("refresh_token", refresh);
  };

  const addTeachSkill = () => {
    const val = teachInput.trim();
    if (val && !teachSkills.includes(val))
      setTeachSkills((prev) => [...prev, val]);
    setTeachInput("");
  };

  const addLearnSkill = () => {
    const val = learnInput.trim();
    if (val && !learnSkills.includes(val))
      setLearnSkills((prev) => [...prev, val]);
    setLearnInput("");
  };

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);
    try {
      const { access_token, refresh_token } = await api.login(
        loginForm.email,
        loginForm.password,
      );
      storeTokens(access_token, refresh_token);
      router.push("/dashboard");
    } catch (err: unknown) {
      setLoginError(
        err instanceof Error ? err.message : "Неверный email или пароль",
      );
    } finally {
      setLoginLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError("");
    if (regForm.password !== regForm.confirm) {
      setRegError("Пароли не совпадают");
      return;
    }
    if (regForm.password.length < 8) {
      setRegError("Пароль должен содержать минимум 8 символов");
      return;
    }
    setRegLoading(true);
    try {
      await api.register(regForm.email, regForm.password);
      setRegSuccess(true);
      const { access_token, refresh_token } = await api.login(
        regForm.email,
        regForm.password,
      );
      storeTokens(access_token, refresh_token);
      // Await the profile saves so data is persisted BEFORE we navigate.
      // Using allSettled so a failure in one save doesn't abort the other.
      const saveResults = await Promise.allSettled([
        api.updateUserProfile({
          name: regForm.fullName,
          avatar: "",
          bio: "",
          contact_number: regForm.phone,
          teach_skills: teachSkills,
          learn_skills: learnSkills,
        }),
        api.updateMatchProfile({
          name: regForm.fullName,
          i_have: teachSkills,
          i_want: learnSkills,
          bio: "",
        }),
      ]);
      // Warn if either profile save failed — account itself is fine.
      const failed = saveResults.filter((r) => r.status === "rejected");
      if (failed.length > 0) {
        const reason =
          failed[0].status === "rejected" && failed[0].reason instanceof Error
            ? failed[0].reason.message
            : "Не удалось сохранить профиль";
        setRegWarn(
          `Аккаунт создан, но данные профиля не сохранились: ${reason}. Обновите профиль вручную.`,
        );
        // Don't navigate yet — let the user see the warning
        return;
      }
      router.push("/dashboard");
    } catch (err: unknown) {
      setRegError(err instanceof Error ? err.message : "Ошибка регистрации");
    } finally {
      setRegLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col">
      {/* ── Header ── */}
      <header className="border-b border-white/5 px-6 py-4">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
            <span className="text-sm">На главную</span>
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-white fill-white/20" />
            </div>
            <span className="font-semibold text-sm">Pairexx</span>
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md space-y-6">
          {/* Title */}
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold">Добро пожаловать</h1>
            <p className="text-zinc-500 text-sm">
              Войди, чтобы начать обмениваться навыками
            </p>
          </div>

          {/* Tab switcher */}
          <div
            className="flex bg-zinc-900 border border-white/5 p-1 rounded-2xl"
            role="tablist"
            aria-label="Auth mode"
          >
            {(["login", "register"] as AuthTab[]).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={clsx(
                  "flex-1 cursor-pointer py-2.5 rounded-xl text-sm font-medium transition-all",
                  tab === t
                    ? "bg-[#050505] text-white shadow"
                    : "text-zinc-500 hover:text-zinc-300",
                )}
              >
                {t === "login" ? "Войти" : "Регистрация"}
              </button>
            ))}
          </div>

          {/* ════════════════ LOGIN ════════════════ */}
          {tab === "login" && (
            <form onSubmit={handleLogin} className="space-y-4">
              {/* Email */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                  Email
                </label>
                {/* Wrapper: position:relative so the icon can be absolute inside */}
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                    <Mail className="h-4 w-4 text-zinc-500" />
                  </div>
                  {/* pl-10 lives directly on <input> — no competing class can override it */}
                  <input
                    type="email"
                    value={loginForm.email}
                    onChange={(e) =>
                      setLoginForm({ ...loginForm, email: e.target.value })
                    }
                    placeholder="you@example.com"
                    className={`${INPUT_CLS} pl-10 pr-4`}
                    required
                    autoComplete="email"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                  Пароль
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                    <Lock className="h-4 w-4 text-zinc-500" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={loginForm.password}
                    onChange={(e) =>
                      setLoginForm({ ...loginForm, password: e.target.value })
                    }
                    placeholder="Ваш пароль"
                    className={`${INPUT_CLS} pl-10 pr-10`}
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-zinc-500 hover:text-white transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {loginError && (
                <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                  {loginError}
                </p>
              )}

              <button
                type="submit"
                disabled={loginLoading}
                className="sleek-button w-full disabled:opacity-50"
              >
                {loginLoading ? "Вхожу..." : "Войти"}
              </button>
            </form>
          )}

          {/* ════════════════ REGISTER ════════════════ */}
          {tab === "register" && (
            <form onSubmit={handleRegister} className="space-y-4">
              {/* ① Full Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                  Полное имя
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                    <User className="h-4 w-4 text-zinc-500" />
                  </div>
                  <input
                    type="text"
                    value={regForm.fullName}
                    onChange={(e) =>
                      setRegForm({ ...regForm, fullName: e.target.value })
                    }
                    placeholder="Иван Иванов"
                    className={`${INPUT_CLS} pl-10 pr-4`}
                    required
                    autoComplete="name"
                  />
                </div>
              </div>

              {/* ② Email */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                  Email
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                    <Mail className="h-4 w-4 text-zinc-500" />
                  </div>
                  <input
                    type="email"
                    value={regForm.email}
                    onChange={(e) =>
                      setRegForm({ ...regForm, email: e.target.value })
                    }
                    placeholder="you@example.com"
                    className={`${INPUT_CLS} pl-10 pr-4`}
                    required
                    autoComplete="email"
                  />
                </div>
              </div>

              {/* ③ Contact Number */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                  Контактный номер
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                    <Phone className="h-4 w-4 text-zinc-500" />
                  </div>
                  <input
                    type="tel"
                    value={regForm.phone}
                    onChange={(e) =>
                      setRegForm({ ...regForm, phone: e.target.value })
                    }
                    placeholder="+7 (___) ___-__-__"
                    className={`${INPUT_CLS} pl-10 pr-4`}
                    autoComplete="tel"
                  />
                </div>
              </div>

              {/* ④ Can Teach */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                  Могу научить
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={teachInput}
                    onChange={(e) => setTeachInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTeachSkill();
                      }
                    }}
                    placeholder="Напр.: Python, дизайн..."
                    className={`${INPUT_CLS} flex-1 px-4`}
                  />
                  <button
                    type="button"
                    onClick={addTeachSkill}
                    disabled={!teachInput.trim()}
                    className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40 transition-colors shrink-0"
                  >
                    <Plus className="h-4 w-4" />
                    Добавить
                  </button>
                </div>
                {teachSkills.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {teachSkills.map((skill, i) => (
                      <span
                        key={i}
                        className="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400"
                      >
                        {skill}
                        <button
                          type="button"
                          onClick={() =>
                            setTeachSkills((prev) =>
                              prev.filter((_, j) => j !== i),
                            )
                          }
                          className="text-emerald-400/60 hover:text-emerald-300 transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* ⑤ Wants to Learn */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                  Хочу изучить
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={learnInput}
                    onChange={(e) => setLearnInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addLearnSkill();
                      }
                    }}
                    placeholder="Напр.: Go, маркетинг..."
                    className={`${INPUT_CLS} flex-1 px-4`}
                  />
                  <button
                    type="button"
                    onClick={addLearnSkill}
                    disabled={!learnInput.trim()}
                    className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40 transition-colors shrink-0"
                  >
                    <Plus className="h-4 w-4" />
                    Добавить
                  </button>
                </div>
                {learnSkills.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {learnSkills.map((skill, i) => (
                      <span
                        key={i}
                        className="flex items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs text-blue-400"
                      >
                        {skill}
                        <button
                          type="button"
                          onClick={() =>
                            setLearnSkills((prev) =>
                              prev.filter((_, j) => j !== i),
                            )
                          }
                          className="text-blue-400/60 hover:text-blue-300 transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* ⑥ Password */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                  Пароль
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                    <Lock className="h-4 w-4 text-zinc-500" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={regForm.password}
                    onChange={(e) =>
                      setRegForm({ ...regForm, password: e.target.value })
                    }
                    placeholder="Минимум 8 символов"
                    className={`${INPUT_CLS} pl-10 pr-10`}
                    required
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-zinc-500 hover:text-white transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* ⑦ Confirm Password */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                  Подтвердите пароль
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                    <Lock className="h-4 w-4 text-zinc-500" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={regForm.confirm}
                    onChange={(e) =>
                      setRegForm({ ...regForm, confirm: e.target.value })
                    }
                    placeholder="Повторите пароль"
                    className={`${INPUT_CLS} pl-10 pr-4`}
                    required
                    autoComplete="new-password"
                  />
                </div>
              </div>

              {regError && (
                <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                  {regError}
                </p>
              )}
              {regWarn && (
                <div className="text-sm text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 space-y-2">
                  <p>{regWarn}</p>
                  <button
                    type="button"
                    onClick={() => router.push("/dashboard")}
                    className="underline text-amber-300 hover:text-amber-200 text-xs"
                  >
                    Войти всё равно →
                  </button>
                </div>
              )}
              {regSuccess && !regWarn && (
                <p className="text-sm text-green-400 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">
                  Аккаунт создан! Переадресация...
                </p>
              )}

              <button
                type="submit"
                disabled={regLoading || regSuccess}
                className="sleek-button w-full disabled:opacity-50"
              >
                {regLoading ? "Регистрирую..." : "Создать аккаунт"}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
