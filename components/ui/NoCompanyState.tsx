import Link from "next/link";

export default function NoCompanyState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-[#1a472a]/10 flex items-center justify-center mb-5">
        <svg
          className="w-8 h-8 text-[#00f5c4]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"
          />
        </svg>
      </div>

      <h2 className="text-xl font-bold text-[var(--text)] mb-2">
        Компания не найдена
      </h2>
      <p className="text-sm text-[var(--muted)] max-w-xs mb-6 leading-relaxed">
        Вы не привязаны ни к одной компании. Попросите администратора добавить
        вас, или проверьте настройки своего аккаунта.
      </p>

      <Link
        href="/dashboard/settings"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1a472a] text-white text-sm font-semibold hover:bg-[#1a472a]/90 transition-colors"
      >
        Перейти в настройки
      </Link>
    </div>
  );
}
