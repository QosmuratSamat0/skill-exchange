import Link from "next/link";
import {
  ArrowRight,
  Award,
  BadgeCheck,
  Bell,
  Check,
  ChevronRight,
  HelpCircle,
  Home,
  MessageSquare,
  Moon,
  Search,
  Shield,
  Star,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";

const navItems = [
  { label: "Features", href: "#features" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Testimonials", href: "#testimonials" },
  { label: "FAQ", href: "#faq" },
];

const stats = [
  { value: "10K+", label: "Active Users" },
  { value: "500+", label: "Skills Available" },
  { value: "25K+", label: "Exchanges Made" },
  { value: "15K+", label: "Goals Completed" },
];

const features = [
  {
    icon: Search,
    title: "Skill Discovery",
    text: "Browse people by what they can teach and what they want to learn, then find the strongest two-way match.",
  },
  {
    icon: MessageSquare,
    title: "Real-Time Chat",
    text: "Coordinate lessons instantly with WebSocket messaging, active conversation states, and unread indicators.",
  },
  {
    icon: Users,
    title: "Skill Exchange",
    text: "Send requests, accept partners, manage active swaps, and complete exchanges only after both users confirm.",
  },
  {
    icon: Award,
    title: "Progress Tracking",
    text: "Keep your learning history clean with completed exchanges, active sessions, and structured notifications.",
  },
  {
    icon: TrendingUp,
    title: "Smart Matching",
    text: "Recommendation logic prioritizes users whose teach-and-learn goals complement your own skill profile.",
  },
  {
    icon: Shield,
    title: "Secure Platform",
    text: "Protected auth, internal service tokens, moderation checks, and safe notification delivery keep the network trusted.",
  },
];

const steps = [
  {
    number: "01",
    title: "Create Your Profile",
    text: "List the skills you can teach and the topics you want to learn.",
  },
  {
    number: "02",
    title: "Find & Connect",
    text: "Browse recommended partners, send an exchange request, and start chatting after acceptance.",
  },
  {
    number: "03",
    title: "Learn & Complete",
    text: "Finish the exchange, confirm completion from both sides, and keep your dashboard up to date.",
  },
];

const testimonials = [
  {
    quote:
      "Pairexx helped me learn Go while I coached someone through React. The match felt natural and the chat made planning simple.",
    name: "Sarah Chen",
    role: "Software Developer",
  },
  {
    quote:
      "I connected with a designer who taught me Figma. In return, I helped them with backend fundamentals. It was exactly the trade I needed.",
    name: "Michael Torres",
    role: "Data Analyst",
  },
  {
    quote:
      "The completion flow is excellent. Both people confirm when the exchange is actually done, so the platform feels honest and organized.",
    name: "Emma Wilson",
    role: "Marketing Manager",
  },
];

const faqs = [
  {
    question: "Is Pairexx free to join?",
    answer:
      "Yes. The platform is designed around community skill exchange instead of paid marketplace listings.",
  },
  {
    question: "How are matches recommended?",
    answer:
      "Pairexx compares what you can teach with what other people want to learn, then highlights reciprocal learning opportunities.",
  },
  {
    question: "Can I chat before accepting an exchange?",
    answer:
      "Chat rooms open after an exchange request is accepted, keeping conversations focused on mutual interest.",
  },
  {
    question: "How does completion work?",
    answer:
      "Either participant can propose completion. The exchange becomes completed only after both sides confirm it.",
  },
];

function LogoMark() {
  return (
    <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-white shadow-[0_12px_28px_rgba(37,99,235,0.35)]">
      <span className="absolute inset-[-5px] rounded-full border border-dashed border-blue-300" />
      <span className="text-[11px] font-black tracking-tight">PX</span>
    </div>
  );
}

function DashboardShowcase() {
  return (
    <div className="mx-auto w-full max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-800 to-zinc-900 text-white shadow-2xl shadow-blue-500/10">
      <div className="grid min-h-[420px] grid-cols-1 md:grid-cols-[220px_1fr]">
        {/* Sidebar */}
        <aside className="hidden border-r border-white/5 bg-zinc-800/50 md:block px-4 py-6">
          <div className="flex items-center gap-2.5 mb-8">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-[11px] font-black text-white shadow-lg shadow-blue-500/20">
              PX
            </div>
            <span className="font-bold text-sm">Pairexx</span>
          </div>
          <nav className="space-y-2">
            {[
              { label: "Главная", emoji: "🏠", active: true },
              { label: "Найти навыки", emoji: "🔍" },
              { label: "Чаты", emoji: "💬" },
              { label: "Уведомления", emoji: "🔔" },
              { label: "Настройки", emoji: "⚙️" },
            ].map((item) => (
              <div
                key={item.label}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  item.active
                    ? "bg-blue-600/20 text-white"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <span>{item.emoji}</span>
                {item.label}
              </div>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <section className="bg-zinc-900/70 p-6 sm:p-8">
          {/* Header */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold tracking-tight text-white mb-1">
              Добро пожаловать, <span className="text-blue-400">Roma</span>
            </h2>
            <p className="text-sm text-zinc-400">
              Ваш центр управления обменом навыками
            </p>
          </div>

          {/* Stats */}
          <div className="grid gap-4 sm:grid-cols-2 mb-6">
            <div className="rounded-2xl border border-white/10 bg-zinc-800/50 hover:bg-zinc-800 p-6 transition-colors">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold text-zinc-300 mb-2">
                    Всего связей
                  </p>
                  <p className="text-3xl font-bold text-white">1</p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/20">
                  <span>👥</span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-zinc-800/50 hover:bg-zinc-800 p-6 transition-colors">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold text-zinc-300 mb-2">
                    Обменено навыков
                  </p>
                  <p className="text-3xl font-bold text-white">1</p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/20">
                  <span>⚡</span>
                </div>
              </div>
            </div>
          </div>

          {/* Settings Section */}
          <div className="rounded-2xl border border-white/10 bg-zinc-800/50 p-6">
            <h3 className="text-base font-semibold text-white mb-4">
              Настройки уведомлений
            </h3>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-white">
                  Email уведомления
                </p>
                <p className="text-xs text-zinc-400 mt-1">
                  Получайте уведомления на почту
                </p>
              </div>
              <div className="flex h-7 w-12 items-center rounded-full bg-blue-600 shadow-lg shadow-blue-500/30 relative cursor-pointer transition-all flex-shrink-0">
                <div className="absolute right-1 h-5 w-5 rounded-full bg-white transition-transform" />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-gradient-to-b from-zinc-950 via-[#0a0a0a] to-zinc-900 text-white selection:bg-blue-500/30">
      {/* Grid background effect */}
      <div className="fixed inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:80px_80px] pointer-events-none [mask-image:radial-gradient(ellipse_80%_100%_at_50%_0%,black_0%,transparent_80%)]" />

      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/5 bg-zinc-950/80 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8 relative">
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 shadow-lg shadow-blue-500/20 text-[11px] font-black text-white">
              PX
            </div>
            <span className="text-lg font-black tracking-tight">Pairexx</span>
          </Link>

          <nav className="hidden items-center gap-9 text-sm font-semibold text-zinc-300 lg:flex">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="transition-colors hover:text-white"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2 sm:gap-4">
            <Link
              href="/auth"
              className="hidden text-sm font-semibold text-zinc-300 transition-colors hover:text-white sm:inline-flex"
            >
              Log in
            </Link>
            <Link
              href="/auth"
              className="inline-flex items-center gap-2 rounded-full bg-blue-600 hover:bg-blue-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition-all duration-200 active:scale-95"
            >
              Get Started
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <section className="relative px-5 pb-16 pt-36 sm:px-8 lg:pb-24 lg:pt-44">
        <div className="absolute inset-x-0 top-20 mx-auto h-[660px] max-w-7xl border-x border-white/5 [mask-image:linear-gradient(to_bottom,black_0%,black_62%,transparent_100%)]" />
        <div className="relative mx-auto max-w-7xl text-center">
          <div className="mb-7 inline-flex items-center rounded-full bg-blue-500/15 border border-blue-500/30 px-5 py-2 text-sm font-bold text-blue-300">
            🚀 Join the Community
          </div>

          <h1 className="mx-auto max-w-4xl text-balance text-5xl font-black leading-[0.98] tracking-tight text-white sm:text-6xl lg:text-7xl">
            Learn New Skills by Trading Your Expertise
          </h1>

          <p className="mx-auto mt-7 max-w-3xl text-balance text-lg leading-8 text-zinc-400 sm:text-xl">
            Pairexx connects you with people who want to learn what you know,
            and teach what you want to learn. Exchange skills, build trust, and
            grow together.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/auth"
              className="group inline-flex w-full items-center justify-center gap-3 rounded-full bg-blue-600 hover:bg-blue-500 px-7 py-4 text-base font-bold text-white shadow-lg shadow-blue-500/25 transition-all duration-200 active:scale-95 sm:w-auto"
            >
              Start Exchanging
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href="/dashboard/find"
              className="inline-flex w-full items-center justify-center rounded-full border border-zinc-700/50 bg-zinc-800/50 hover:bg-zinc-800 hover:border-zinc-600 px-8 py-4 text-base font-bold text-white transition-all duration-200 sm:w-auto"
            >
              Browse Skills
            </Link>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-zinc-400">
            {["Free to join", "No subscriptions", "Real connections"].map(
              (item) => (
                <span key={item} className="inline-flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-blue-400" />
                  {item}
                </span>
              ),
            )}
          </div>

          <div className="mt-16 lg:mt-20">
            <DashboardShowcase />
          </div>
        </div>
      </section>

      <section className="border-y border-white/5 bg-zinc-800/30 px-5 py-12 sm:px-8">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 text-center md:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label}>
              <p className="text-3xl font-black tracking-tight text-blue-400 sm:text-4xl">
                {stat.value}
              </p>
              <p className="mt-2 text-sm text-zinc-400">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="features" className="px-5 py-24 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto mb-12 max-w-3xl text-center">
            <span className="inline-flex rounded-full bg-blue-500/15 border border-blue-500/30 px-4 py-2 text-xs font-bold text-blue-300">
              FEATURES
            </span>
            <h2 className="mt-6 text-3xl font-black tracking-tight sm:text-4xl">
              Everything You Need to Grow
            </h2>
            <p className="mt-4 text-lg leading-8 text-zinc-400">
              Discover skills, connect with learners, coordinate sessions, and
              track progress in one seamless platform.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <article
                  key={feature.title}
                  className="rounded-2xl border border-white/5 bg-zinc-800/50 hover:bg-zinc-800 p-8 transition-all duration-200 hover:-translate-y-1"
                >
                  <div className="mb-7 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/20 text-blue-400">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-xl font-black">{feature.title}</h3>
                  <p className="mt-3 leading-7 text-zinc-400">
                    {feature.text}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section
        id="how-it-works"
        className="border-y border-white/5 bg-zinc-800/20 px-5 py-24 sm:px-8"
      >
        <div className="mx-auto max-w-6xl text-center">
          <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
            Start Exchanging in 3 Easy Steps
          </h2>
          <p className="mt-4 text-lg text-zinc-400">
            Join the community and begin your learning journey in minutes.
          </p>

          <div className="mt-16 grid gap-12 md:grid-cols-3">
            {steps.map((step) => (
              <article key={step.number} className="text-center">
                <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-blue-500 text-lg font-black text-white shadow-lg shadow-blue-600/30">
                  {step.number}
                </div>
                <h3 className="text-xl font-black">{step.title}</h3>
                <p className="mx-auto mt-4 max-w-sm leading-7 text-zinc-400">
                  {step.text}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="testimonials" className="px-5 py-24 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto mb-12 max-w-3xl text-center">
            <span className="inline-flex rounded-full bg-blue-500/15 border border-blue-500/30 px-4 py-2 text-xs font-bold text-blue-300">
              TESTIMONIALS
            </span>
            <h2 className="mt-6 text-3xl font-black tracking-tight sm:text-4xl">
              Loved by Learners Everywhere
            </h2>
            <p className="mt-4 text-lg text-zinc-400">
              See what members say about their skill exchange experiences.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {testimonials.map((item) => (
              <article
                key={item.name}
                className="rounded-2xl border border-white/5 bg-zinc-800/50 hover:bg-zinc-800 p-8 transition-all duration-200"
              >
                <div className="mb-5 flex gap-1 text-blue-400">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Star
                      key={index}
                      className="h-4 w-4 fill-current"
                    />
                  ))}
                </div>
                <p className="leading-7 text-zinc-300">{item.quote}</p>
                <div className="mt-8">
                  <p className="font-black">{item.name}</p>
                  <p className="text-sm text-zinc-400">{item.role}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="px-5 pb-24 sm:px-8">
        <div className="mx-auto max-w-4xl">
          <div className="mb-10 text-center">
            <span className="inline-flex rounded-full bg-blue-500/15 border border-blue-500/30 px-4 py-2 text-xs font-bold text-blue-300">
              FAQ
            </span>
            <h2 className="mt-6 text-3xl font-black tracking-tight sm:text-4xl">
              Questions, Answered
            </h2>
          </div>

          <div className="grid gap-4">
            {faqs.map((faq) => (
              <article
                key={faq.question}
                className="rounded-2xl border border-white/5 bg-zinc-800/50 hover:bg-zinc-800 p-6 transition-all duration-200"
              >
                <div className="flex gap-4">
                  <HelpCircle className="mt-1 h-5 w-5 shrink-0 text-blue-400" />
                  <div>
                    <h3 className="font-black">{faq.question}</h3>
                    <p className="mt-2 leading-7 text-zinc-400">
                      {faq.answer}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-white/5 bg-zinc-900/50 px-5 py-10 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 text-sm text-zinc-400 md:flex-row">
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-[10px] font-black text-white">
              PX
            </div>
            <span className="font-black text-white">Pairexx</span>
          </Link>
          <p>© {new Date().getFullYear()} Pairexx. Skill exchange made simple.</p>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-white transition-colors">
              Privacy
            </Link>
            <Link href="/rules" className="hover:text-white transition-colors">
              Rules
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
