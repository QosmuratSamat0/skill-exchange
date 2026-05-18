import Link from 'next/link';
import { ChevronLeft, ShieldCheck } from 'lucide-react';

export default function RulesPage() {
  return (
    <main className="min-h-screen bg-[#050505] text-white p-6 md:p-12">
      <div className="max-w-3xl mx-auto">
        <Link 
          href="/" 
          className="inline-flex items-center gap-2 text-zinc-500 hover:text-white transition-colors mb-12 group"
        >
          <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          Назад
        </Link>

        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 bg-blue-600/10 border border-blue-600/20 flex items-center justify-center rounded-xl">
            <ShieldCheck className="w-6 h-6 text-blue-500" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight">Правила сообщества</h1>
        </div>

        <div className="space-y-12 text-zinc-400 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">1. Уважение и этика</h2>
            <p>
              Мы стремимся создать безопасную среду для общения. Любые формы оскорблений, проявления ненависти, 
              дискриминации или травли по отношению к собеседникам строго запрещены. Будьте вежливы и уважайте чужие границы.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">2. Запрещенный контент</h2>
            <p>
              Запрещается распространение материалов эротического или порнографического характера, 
              изображений насилия, а также любого контента, нарушающего законодательство. 
              Система модерации и жалоб позволяет нам оперативно блокировать нарушителей.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">3. Спам и реклама</h2>
            <p>
              Рассылка рекламных сообщений, ссылок на сторонние ресурсы с целью наживы, 
              массовый спам или попытки фишинга приведут к немедленной блокировке вашего доступа к сервису.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">4. Анонимность</h2>
            <p>
              pairexx — анонимный чат. Мы не рекомендуем передавать личную информацию (телефон, адрес, ссылки на соцсети) 
              незнакомым людям. Вы делаете это на свой страх и риск.
            </p>
          </section>

          <section className="pt-8 border-t border-zinc-900">
            <p className="text-sm">
              Нарушение данных правил может привести к ограничению доступа к сервису. 
              Давайте общаться культурно!
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}

