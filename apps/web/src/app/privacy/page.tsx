import Link from 'next/link';
import { ChevronLeft, Lock } from 'lucide-react';

export default function PrivacyPage() {
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
          <div className="w-12 h-12 bg-emerald-600/10 border border-emerald-600/20 flex items-center justify-center rounded-xl">
            <Lock className="w-6 h-6 text-emerald-500" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight">Конфиденциальность</h1>
        </div>

        <div className="space-y-12 text-zinc-400 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">1. Сбор информации</h2>
            <p>
              Мы спроектировали pairexx так, чтобы собирать минимум данных. Мы не требуем регистрации, 
              почты или номера телефона. Для работы сервиса используются только технические идентификаторы: 
              анонимный ID устройства и временные токены сессии.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">2. Использование данных</h2>
            <p>
              Технические данные (ID устройства, IP-адрес) используются исключительно для:
            </p>
            <ul className="list-disc pl-5 mt-4 space-y-2">
              <li>Подбора подходящего собеседника по вашим фильтрам.</li>
              <li>Защиты сервиса от спам-атак и злоупотреблений.</li>
              <li>Обеспечения стабильной работы WebSocket-соединения.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">3. Хранение переписки</h2>
            <p>
              Ваши сообщения передаются в зашифрованном виде и доставляются собеседнику в режиме реального времени. 
              Мы не храним историю чатов на наших серверах после завершения сессии. Как только вы или ваш 
              собеседник нажимаете «Следующий» или закрываете вкладку, данные о текущем чате удаляются.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-4">4. Безопасность</h2>
            <p>
              Несмотря на анонимность, мы используем современные методы защиты данных и шифрования трафика. 
              Однако помните, что ваша безопасность в чате также зависит от того, какую информацию вы решаете 
              сообщить незнакомому человеку.
            </p>
          </section>

          <section className="pt-8 border-t border-zinc-900 text-sm italic">
            <p>
              Обновлено: {new Date().toLocaleDateString('ru-RU')}
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}

