"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { Logo } from "@/components/Logo";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error: authError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`,
      }
    );

    setLoading(false);

    if (authError) {
      setError("Не удалось отправить письмо. Проверьте email и попробуйте снова.");
      return;
    }

    setSent(true);
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

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          {sent ? (
            // ── Success state ───────────────────────────
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Проверьте почту</h2>
              <p className="text-sm text-gray-500 mb-6">
                Мы отправили ссылку для сброса пароля на{" "}
                <span className="font-medium text-gray-700">{email}</span>.
                Проверьте папку «Спам», если письмо не пришло.
              </p>
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-[#1a472a] hover:underline"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                Вернуться ко входу
              </Link>
            </div>
          ) : (
            // ── Form ────────────────────────────────────
            <>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Сброс пароля</h2>
              <p className="text-sm text-gray-500 mb-6">
                Введите email — мы пришлём ссылку для создания нового пароля.
              </p>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
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
                  disabled={loading}
                  className="w-full py-2.5 px-4 bg-[#1a472a] hover:bg-[#163d24] text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
                >
                  {loading ? "Отправка..." : "Отправить ссылку"}
                </button>
              </form>

              <div className="mt-5 text-center">
                <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-[#1a472a] transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  Вернуться ко входу
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
