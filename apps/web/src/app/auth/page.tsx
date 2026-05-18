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
  "w-full rounded-2xl border border-zinc-700/50 bg-zinc-800/80 py-3.5 px-4 text-zinc-100 " +
  "placeholder:text-zinc-500 transition-all focus:border-blue-500/60 focus:bg-zinc-800 " +
  "focus:outline-none focus:ring-2 focus:ring-blue-500/20";

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
    <div className="min-h-screen w-full bg-gradient-to-br from-zinc-900 via-[#0a0a0a] to-zinc-950 text-white flex flex-col items-center justify-center px-4">
      {/* ── Background grid effect ── */}
      <div className="fixed inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:80px_80px] pointer-events-none [mask-image:radial-gradient(ellipse_80%_100%_at_50%_0%,black_0%,transparent_80%)]" />

      {/* ── Back Link ── */}
      <Link
        href="/"
        className="absolute top-6 left-6 flex items-center gap-2 text-zinc-400 hover:text-white transition-colors text-sm font-medium"
      >
        <ChevronLeft className="w-4 h-4" />
        Back
      </Link>

      {/* ── Main Content Card ── */}
      <main className="relative z-10 w-full max-w-md">
        <div className="rounded-3xl border border-white/10 bg-zinc-900/80 backdrop-blur-xl px-8 py-10 sm:px-10 sm:py-12 shadow-2xl shadow-zinc-900/50">
          
          {/* ════════════════ LOGIN ════════════════ */}
          {tab === "login" && (
            <form onSubmit={handleLogin} className="space-y-6 animate-in fade-in-50 duration-300">
              {/* Header */}
              <div className="text-center space-y-2 mb-8">
                <h1 className="text-3xl font-bold tracking-tight">Welcome Back</h1>
                <p className="text-sm text-zinc-400">
                  Sign in to your Pairexx account
                </p>
              </div>

              {/* Email */}
              <div className="space-y-2.5">
                <label className="block text-sm font-semibold text-zinc-200">
                  Email
                </label>
                <input
                  type="email"
                  value={loginForm.email}
                  onChange={(e) =>
                    setLoginForm({ ...loginForm, email: e.target.value })
                  }
                  placeholder="Enter your email"
                  className={`${INPUT_CLS} w-full px-4`}
                  required
                  autoComplete="email"
                />
              </div>

              {/* Password */}
              <div className="space-y-2.5">
                <label className="block text-sm font-semibold text-zinc-200">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={loginForm.password}
                    onChange={(e) =>
                      setLoginForm({ ...loginForm, password: e.target.value })
                    }
                    placeholder="Enter your password"
                    className={`${INPUT_CLS} w-full px-4 pr-12`}
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-4 text-zinc-500 hover:text-white transition-colors"
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
                className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 px-6 py-3 font-bold text-white transition-all hover:shadow-lg hover:shadow-blue-500/30 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed duration-200 mt-2"
              >
                {loginLoading ? "Signing in..." : "Log In"}
              </button>

              {/* Switch to signup */}
              <div className="text-center pt-2">
                <p className="text-sm text-zinc-400">
                  Don't have an account?{" "}
                  <button
                    type="button"
                    onClick={() => setTab("register")}
                    className="text-blue-400 hover:text-blue-300 font-semibold transition-colors"
                  >
                    Signup here
                  </button>
                </p>
              </div>
            </form>
          )}

          {/* ════════════════ REGISTER ════════════════ */}
          {tab === "register" && (
            <form onSubmit={handleRegister} className="space-y-5 animate-in fade-in-50 duration-300">
              {/* Header */}
              <div className="text-center space-y-2 mb-8">
                <h1 className="text-3xl font-bold tracking-tight">Create an Account</h1>
                <p className="text-sm text-zinc-400">
                  Join Pairexx and start sharing your skills
                </p>
              </div>

              {/* Scrollable form */}
              <div className="max-h-[calc(100vh-300px)] overflow-y-auto space-y-5 pr-2">
                
                {/* Full Name */}
                <div className="space-y-2.5">
                  <label className="block text-sm font-semibold text-zinc-200">
                    Name
                  </label>
                  <input
                    type="text"
                    value={regForm.fullName}
                    onChange={(e) =>
                      setRegForm({ ...regForm, fullName: e.target.value })
                    }
                    placeholder="Enter your name"
                    className={`${INPUT_CLS} w-full px-4`}
                    required
                    autoComplete="name"
                  />
                </div>

                {/* Email */}
                <div className="space-y-2.5">
                  <label className="block text-sm font-semibold text-zinc-200">
                    Email
                  </label>
                  <input
                    type="email"
                    value={regForm.email}
                    onChange={(e) =>
                      setRegForm({ ...regForm, email: e.target.value })
                    }
                    placeholder="Enter your email"
                    className={`${INPUT_CLS} w-full px-4`}
                    required
                    autoComplete="email"
                  />
                </div>

                {/* Contact Number */}
                <div className="space-y-2.5">
                  <label className="block text-sm font-semibold text-zinc-200">
                    Contact Number
                  </label>
                  <input
                    type="tel"
                    value={regForm.phone}
                    onChange={(e) =>
                      setRegForm({ ...regForm, phone: e.target.value })
                    }
                    placeholder="Enter your contact number"
                    className={`${INPUT_CLS} w-full px-4`}
                    autoComplete="tel"
                  />
                </div>

                {/* Can Teach */}
                <div className="space-y-2.5">
                  <label className="block text-sm font-semibold text-zinc-200">
                    Can Teach
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
                      placeholder="Enter a can teach..."
                      className={`${INPUT_CLS} flex-1 px-4`}
                    />
                    <button
                      type="button"
                      onClick={addTeachSkill}
                      disabled={!teachInput.trim()}
                      className="flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 px-4 py-3 text-sm font-bold text-white disabled:opacity-40 transition-colors shrink-0 duration-200"
                    >
                      Add
                    </button>
                  </div>
                  {teachSkills.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-2">
                      {teachSkills.map((skill, i) => (
                        <span
                          key={i}
                          className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-3 py-1.5 text-xs text-emerald-300 font-medium"
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

                {/* Wants to Learn */}
                <div className="space-y-2.5">
                  <label className="block text-sm font-semibold text-zinc-200">
                    Wants to Learn
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
                      placeholder="Enter a wants to learn..."
                      className={`${INPUT_CLS} flex-1 px-4`}
                    />
                    <button
                      type="button"
                      onClick={addLearnSkill}
                      disabled={!learnInput.trim()}
                      className="flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 px-4 py-3 text-sm font-bold text-white disabled:opacity-40 transition-colors shrink-0 duration-200"
                    >
                      Add
                    </button>
                  </div>
                  {learnSkills.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-2">
                      {learnSkills.map((skill, i) => (
                        <span
                          key={i}
                          className="flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/15 px-3 py-1.5 text-xs text-blue-300 font-medium"
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

                {/* Password */}
                <div className="space-y-2.5">
                  <label className="block text-sm font-semibold text-zinc-200">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={regForm.password}
                      onChange={(e) =>
                        setRegForm({ ...regForm, password: e.target.value })
                      }
                      placeholder="Enter your password"
                      className={`${INPUT_CLS} w-full px-4 pr-12`}
                      required
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 flex items-center pr-4 text-zinc-500 hover:text-white transition-colors"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Confirm Password */}
                <div className="space-y-2.5">
                  <label className="block text-sm font-semibold text-zinc-200">
                    Confirm Password
                  </label>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={regForm.confirm}
                    onChange={(e) =>
                      setRegForm({ ...regForm, confirm: e.target.value })
                    }
                    placeholder="Confirm your password"
                    className={`${INPUT_CLS} w-full px-4`}
                    required
                    autoComplete="new-password"
                  />
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
                      className="underline text-amber-300 hover:text-amber-200 text-xs font-medium"
                    >
                      Continue anyway →
                    </button>
                  </div>
                )}
                {regSuccess && !regWarn && (
                  <p className="text-sm text-green-400 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">
                    ✓ Account created! Redirecting...
                  </p>
                )}

              </div>

              <button
                type="submit"
                disabled={regLoading || regSuccess}
                className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 px-6 py-3 font-bold text-white transition-all hover:shadow-lg hover:shadow-blue-500/30 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed duration-200 mt-2"
              >
                {regLoading ? "Creating account..." : "Sign Up"}
              </button>

              {/* Switch to login */}
              <div className="text-center pt-2">
                <p className="text-sm text-zinc-400">
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() => setTab("login")}
                    className="text-blue-400 hover:text-blue-300 font-semibold transition-colors"
                  >
                    Login here
                  </button>
                </p>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
