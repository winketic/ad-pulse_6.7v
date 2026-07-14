import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function NotFound() {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: "var(--bg)" }}
    >
      <div className="text-center max-w-md w-full">
        <div className="flex justify-center mb-8">
          <Logo size={48} />
        </div>

        <div
          className="text-8xl font-black tabular-nums mb-4 select-none"
          style={{ color: "var(--accent)", letterSpacing: "-0.05em" }}
        >
          404
        </div>

        <h1 className="text-xl font-bold mb-2" style={{ color: "var(--text)" }}>
          Страница не найдена
        </h1>
        <p className="text-sm mb-8" style={{ color: "#6b7280" }}>
          Возможно, ссылка устарела или страница была перемещена.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/dashboard"
            className="px-6 py-3 rounded-xl text-sm font-semibold transition-all"
            style={{ background: "var(--accent)", color: "var(--accent-text)" }}
          >
            На главную
          </Link>
          <Link
            href="/login"
            className="px-6 py-3 rounded-xl text-sm font-medium transition-all"
            style={{ background: "var(--surface-2)", color: "var(--muted)", border: "1px solid var(--border-strong)" }}
          >
            Войти
          </Link>
        </div>
      </div>
    </div>
  );
}
