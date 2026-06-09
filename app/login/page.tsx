"use client";

import { useState, useEffect, Suspense } from "react";
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
  const [isProcessingToken, setIsProcessingToken] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.includes("access_token")) return;

    setIsProcessingToken(true);

    // Parse fragment: #access_token=...&refresh_token=...&type=magiclink|recovery
    const params = new URLSearchParams(hash.slice(1));
    const accessToken  = params.get("access_token");
    const refreshToken = params.get("refresh_token") ?? "";

    if (!accessToken) { setIsProcessingToken(false); return; }

    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => {
        if (error) {
          console.error("[login] setSession error:", error.message);
          setIsProcessingToken(false);
          return;
        }
        // Clear hash before redirecting
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
        router.replace(searchParams.get("next") ?? "/dashboard");
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) { setError(mapError(authError.message)); setLoading(false); return; }
    if (!data.user?.email_confirmed_at) { router.push("/verify-email"); }
    else { router.push(searchParams.get("next") ?? "/dashboard"); }
    router.refresh();
  };

  if (isProcessingToken) {
    return (
      <div className="dp-auth-page">
        <div className="text-center">
          <svg className="animate-spin h-8 w-8 text-[#00f5c4] mx-auto mb-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm text-[#888888]">Выполняем вход...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dp-auth-page">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4"><Logo size={48} /></div>
          <h1 className="text-2xl font-bold text-[#ededed] tracking-tight">AD Pulse</h1>
          <p className="text-sm text-[#888888] mt-1">Система учёта материалов</p>
        </div>

        {searchParams.get("message") === "password_updated" && (
          <div className="mb-4 flex items-start gap-2.5 px-4 py-3 rounded-xl bg-[#00f5c4]/10 border border-[#00f5c4]/30">
            <svg className="w-4 h-4 text-[#00f5c4] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm text-[#00f5c4] font-medium">Пароль успешно изменён. Войдите с новым паролем.</span>
          </div>
        )}

        <div className="dp-auth-card">
          <h2 className="text-lg font-semibold text-[#ededed] mb-6">Вход в систему</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#888888] mb-1.5">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com" required autoComplete="email" className="dp-input" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#888888] mb-1.5">Пароль</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" required autoComplete="current-password" className="dp-input" />
            </div>

            {error && (
              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <svg className="w-4 h-4 text-red-400 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span className="text-sm text-red-400">{error}</span>
              </div>
            )}

            <div className="flex justify-end">
              <a href="/forgot-password" className="text-xs text-[#888888] hover:text-[#00f5c4] transition-colors">
                Забыли пароль?
              </a>
            </div>

            <button type="submit" disabled={loading} className="dp-btn-primary w-full py-2.5 mt-1">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Выполняется вход...
                </span>
              ) : "Войти"}
            </button>
          </form>

          <p className="text-center text-sm text-[#888888] mt-6">
            Нет аккаунта?{" "}
            <Link href="/register" className="font-medium text-[#ededed] hover:text-[#00f5c4] transition-colors">
              Оставить заявку
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
