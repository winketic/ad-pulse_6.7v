import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function NotFound() {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: "#05050a" }}
    >
      <div className="text-center max-w-md w-full">
        <div className="flex justify-center mb-8">
          <Logo size={48} />
        </div>

        <div
          className="text-8xl font-black tabular-nums mb-4 select-none"
          style={{ color: "#00f5c4", letterSpacing: "-0.05em" }}
        >
          404
        </div>

        <h1 className="text-xl font-bold mb-2" style={{ color: "#f9fafb" }}>
          Страница не найдена
        </h1>
        <p className="text-sm mb-8" style={{ color: "#6b7280" }}>
          Возможно, ссылка устарела или страница была перемещена.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/dashboard"
            className="px-6 py-3 rounded-xl text-sm font-semibold transition-all"
            style={{ background: "#00f5c4", color: "#05050a" }}
          >
            На главную
          </Link>
          <Link
            href="/login"
            className="px-6 py-3 rounded-xl text-sm font-medium transition-all"
            style={{ background: "#1a1a2e", color: "#9ca3af", border: "1px solid #2a2a3d" }}
          >
            Войти
          </Link>
        </div>
      </div>
    </div>
  );
}
