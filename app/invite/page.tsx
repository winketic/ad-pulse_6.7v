"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { Logo } from "@/components/Logo";

function passwordStrength(pwd: string): { score: number; label: string; color: string } {
  if (pwd.length === 0) return { score: 0, label: "", color: "" };
  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  if (score <= 1) return { score, label: "Слабый", color: "bg-red-400" };
  if (score <= 2) return { score, label: "Средний", color: "bg-amber-400" };
  if (score <= 3) return { score, label: "Хороший", color: "bg-yellow-400" };
  return { score, label: "Надёжный", color: "bg-[#00f5c4]" };
}

export default function InvitePage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (params.get("error") === "expired") {
      setError("Ссылка недействительна или истекла. Попросите администратора отправить приглашение повторно.");
      return;
    }

    const token_hash = params.get("token_hash");
    const type = params.get("type");

    if (token_hash) {
      supabase.auth
        .verifyOtp({ token_hash, type: (type as "invite") ?? "invite" })
        .then(({ error: otpError }) => {
          if (otpError) {
            setError("Ссылка недействительна или истекла. Попросите администратора отправить приглашение повторно.");
          } else {
            setReady(true);
          }
        });
      return;
    }

    // Fallback: token already processed (page reload) or hash-based flow
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "USER_UPDATED") setReady(true);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });
    return () => subscription.unsubscribe();
  }, [supabase]);

  const validate = (): string | null => {
    if (password.length < 8) return "Пароль должен содержать минимум 8 символов";
    if (password !== confirm) return "Пароли не совпадают";
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setError("");
    setLoading(true);

    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError("Не удалось установить пароль. Попробуйте обновить страницу.");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  };

  const strength = passwordStrength(password);
  const strengthWidth = strength.score > 0 ? `${(strength.score / 5) * 100}%` : "0%";

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Logo size={64} />
          </div>
          <h1 className="text-2xl font-bold text-[#05050a] tracking-tight">
            Добро пожаловать в AD Pulse
          </h1>
          <p className="text-sm text-gray-400 mt-1">Установите пароль для вашего аккаунта</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          {!ready ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-gray-400">
              <svg className="animate-spin h-6 w-6" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-sm">Проверяем приглашение…</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Новый пароль
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Минимум 8 символов"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#05050a]/20 focus:border-[#05050a] transition-colors"
                />
                {/* Strength indicator */}
                {password.length > 0 && (
                  <div className="mt-2">
                    <div className="h-1 w-full bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${strength.color}`}
                        style={{ width: strengthWidth }}
                      />
                    </div>
                    <p className={`text-xs mt-1 ${strength.score >= 4 ? "text-[#00a882]" : strength.score >= 3 ? "text-amber-500" : "text-red-500"}`}>
                      {strength.label}
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="confirm" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Подтвердите пароль
                </label>
                <input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Повторите пароль"
                  required
                  autoComplete="new-password"
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#05050a]/20 focus:border-[#05050a] transition-colors"
                />
                {confirm.length > 0 && password !== confirm && (
                  <p className="text-xs text-red-500 mt-1">Пароли не совпадают</p>
                )}
                {confirm.length > 0 && password === confirm && password.length >= 8 && (
                  <p className="text-xs text-[#00a882] mt-1">✓ Пароли совпадают</p>
                )}
              </div>

              {error && (
                <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-red-50 border border-red-200">
                  <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm text-red-700">{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || password.length < 8 || password !== confirm}
                className="w-full py-2.5 px-4 bg-[#05050a] hover:bg-[#1a1a2e] text-[#00f5c4] text-sm font-semibold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Сохранение…
                  </span>
                ) : "Войти в систему"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
