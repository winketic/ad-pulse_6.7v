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
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://pulse.altaidynamics.kz")
      .replace(/﻿/g, "").trim().replace(/\/$/, "");
    const { error: authError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${appUrl}/auth/confirm`,
    });
    setLoading(false);
    if (authError) { setError("Не удалось отправить письмо. Проверьте email."); return; }
    setSent(true);
  };

  return (
    <div className="dp-auth-page">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4"><Logo size={48} /></div>
          <h1 className="text-2xl font-bold text-[#ededed] tracking-tight">AD Pulse</h1>
          <p className="text-sm text-[#888888] mt-1">Система учёта материалов</p>
        </div>

        <div className="dp-auth-card">
          {sent ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-[#00f5c4]/10 border border-[#00f5c4]/30 flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-[#00f5c4]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-[#ededed] mb-2">Проверьте почту</h2>
              <p className="text-sm text-[#888888] mb-6">
                Мы отправили ссылку на <span className="text-[#ededed]">{email}</span>.
                Проверьте папку «Спам».
              </p>
              <Link href="/login" className="text-sm text-[#888888] hover:text-[#00f5c4] transition-colors flex items-center justify-center gap-1.5">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                Вернуться ко входу
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-[#ededed] mb-2">Сброс пароля</h2>
              <p className="text-sm text-[#888888] mb-6">Введите email — мы пришлём ссылку для создания нового пароля.</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#888888] mb-1.5">Email</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com" required autoComplete="email" className="dp-input" />
                </div>
                {error && (
                  <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                    <span className="text-sm text-red-400">{error}</span>
                  </div>
                )}
                <button type="submit" disabled={loading} className="dp-btn-primary w-full py-2.5">
                  {loading ? "Отправка..." : "Отправить ссылку"}
                </button>
              </form>
              <div className="mt-5 text-center">
                <Link href="/login" className="text-sm text-[#888888] hover:text-[#00f5c4] transition-colors inline-flex items-center gap-1.5">
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
