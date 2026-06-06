"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { Logo } from "@/components/Logo";

function mapError(msg: string): string {
  if (msg.includes("Invalid login credentials")) return "Неверный email или пароль";
  if (msg.includes("Email not confirmed")) return "Подтвердите email перед входом";
  if (msg.includes("Too many requests")) return "Слишком много попыток. Подождите немного";
  return "Ошибка входа. Попробуйте снова";
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(mapError(authError.message));
      setLoading(false);
      return;
    }

    if (!data.user?.email_confirmed_at) {
      router.push("/verify-email");
    } else {
      const next = searchParams.get("next") ?? "/dashboard";
      router.push(next);
    }
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Logo size={64} />
          </div>
          <h1 className="text-2xl font-bold text-[#05050a] tracking-tight">AD Pulse</h1>
          <p className="text-sm text-gray-400 mt-1">Система учёта материалов</p>
        </div>

        {/* Success message from password reset */}
        {searchParams.get("message") === "password_updated" && (
          <div className="mb-4 flex items-start gap-2.5 px-4 py-3.5 rounded-xl bg-green-50 border border-green-200">
            <svg className="w-4 h-4 text-green-600 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span className="text-sm text-green-700 font-medium">
              Пароль успешно изменён. Войдите с новым паролем.
            </span>
          </div>
        )}

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Вход в систему</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 mb-1.5"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                autoComplete="email"
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a472a]/50 focus:border-[#1a472a] transition-colors"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700 mb-1.5"
              >
                Пароль
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a472a]/50 focus:border-[#1a472a] transition-colors"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-red-50 border border-red-200">
                <svg
                  className="w-4 h-4 text-red-500 shrink-0 mt-0.5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="text-sm text-red-700">{error}</span>
              </div>
            )}

            <div className="flex justify-end">
              <a
                href="/forgot-password"
                className="text-xs text-gray-400 hover:text-[#1a472a] transition-colors"
              >
                Забыли пароль?
              </a>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-[#1a472a] hover:bg-[#163d24] active:bg-[#122f1c] text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-1 shadow-sm"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="animate-spin h-4 w-4 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Выполняется вход...
                </span>
              ) : (
                "Войти"
              )}
            </button>
          </form>

          <p className="text-center text-sm text-gray-400 mt-6">
            Нет аккаунта?{" "}
            <Link href="/register" className="font-medium text-[#05050a] hover:underline">
              Оставить заявку
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
