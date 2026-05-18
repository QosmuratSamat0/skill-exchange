import Link from "next/link";
import {
  MessageSquare,
  Sparkles,
  Zap,
  ArrowRight,
  GraduationCap,
} from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen text-white bg-[#050505] selection:bg-blue-500/30 overflow-x-hidden">
      {/* Навигация */}
      <header className="fixed top-0 w-full z-50 border-b border-white/5 bg-[#050505]/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3 font-semibold text-xl tracking-tight group cursor-pointer">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105">
              <Sparkles className="w-5 h-5 text-white fill-white/20" />
            </div>
            <span>pairexx</span>
          </div>
          <nav className="flex items-center gap-3">
            <Link
              href="/auth"
              className="sleek-button-secondary text-sm px-5 py-2.5"
            >
              Войти
            </Link>
            <Link
              href="/dashboard"
              className="sleek-button text-sm px-8 py-2.5"
            >
              В Витрину
            </Link>
          </nav>
        </div>
      </header>

      <main className="pt-48 pb-20 px-6">
        <div className="max-w-6xl mx-auto">
          {/* Главный блок (Hero) */}
          <section className="text-center max-w-4xl mx-auto mb-40">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium mb-8">
              <Zap className="w-3.5 h-3.5 fill-blue-400" />
              <span>Обмен знаниями • Peer-to-Peer обучение</span>
            </div>

            <h1 className="text-6xl md:text-8xl font-bold tracking-tight mb-10 leading-[1.1]">
              Учись{" "}
              <span className="bg-blue-600 px-3 py-1 text-white inline-block transform -rotate-2 rounded-lg">
                вместе.
              </span>{" "}
              <br />
              <span className="text-zinc-500">Меняйся опытом.</span>
            </h1>

            <p className="text-xl md:text-2xl text-zinc-400 mb-12 max-w-2xl mx-auto leading-relaxed">
              Платформа для обмена навыками. <br className="hidden md:block" />
              Найди тех, кто знает то, что хочешь выучить ты, и поделись своим
              опытом взамен.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/dashboard"
                className="w-full sm:w-auto sleek-button text-lg py-4 px-10 flex items-center justify-center gap-3 group"
              >
                Найти напарника
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                href="#features"
                className="w-full sm:w-auto sleek-button-secondary text-lg py-4 px-10"
              >
                Как это работает?
              </Link>
            </div>
          </section>

          {/* Преимущества (Features) */}
          <section id="features" className="scroll-mt-32">
            <div className="grid md:grid-cols-3 gap-6">
              <div className="sleek-card group hover:border-zinc-700 transition-colors">
                <div className="w-12 h-12 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-center mb-8 group-hover:bg-blue-600/10 group-hover:border-blue-600/20 transition-colors">
                  <GraduationCap className="w-6 h-6 text-zinc-400 group-hover:text-blue-500 transition-colors" />
                </div>
                <h3 className="text-xl font-semibold mb-4">Витрина навыков</h3>
                <p className="text-zinc-500 leading-relaxed">
                  Просматривай профили реальных людей. Выбирай тех, чьи знания
                  тебе действительно полезны.
                </p>
              </div>

              <div className="sleek-card group hover:border-zinc-700 transition-colors">
                <div className="w-12 h-12 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-center mb-8 group-hover:bg-blue-600/10 group-hover:border-blue-600/20 transition-colors">
                  <MessageSquare className="w-6 h-6 text-zinc-400 group-hover:text-blue-500 transition-colors" />
                </div>
                <h3 className="text-xl font-semibold mb-4">Прямой диалог</h3>
                <p className="text-zinc-500 leading-relaxed">
                  Отправляй запросы на обмен и начинай чат только после
                  взаимного подтверждения интереса.
                </p>
              </div>

              <div className="sleek-card group hover:border-zinc-700 transition-colors">
                <div className="w-12 h-12 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-center mb-8 group-hover:bg-blue-600/10 group-hover:border-blue-600/20 transition-colors">
                  <Zap className="w-6 h-6 text-zinc-400 group-hover:text-blue-500 transition-colors" />
                </div>
                <h3 className="text-xl font-semibold mb-4">Win-Win обмен</h3>
                <p className="text-zinc-500 leading-relaxed">
                  Система сама подберет людей, которым интересно то, что знаешь
                  ты, и наоборот.
                </p>
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* Подвал */}
      <footer className="border-t border-zinc-900 mt-40">
        <div className="max-w-6xl mx-auto px-6 py-12 flex flex-col md:flex-row items-center justify-between text-sm text-zinc-600">
          <p>
            © {new Date().getFullYear()} pairexx. Твои навыки — твоя валюта.
          </p>
          <div className="flex gap-8 mt-6 md:mt-0">
            <Link href="/rules" className="hover:text-white transition-colors">
              Правила
            </Link>
            <Link
              href="/privacy"
              className="hover:text-white transition-colors"
            >
              Конфиденциальность
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
