"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { Logo } from "@/components/Logo";

export default function VerifyEmailPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const supabase = createClient();

  // Load current user's email
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setEmail(user.email);
    });

    // If user confirms in another tab, redirect automatically
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event) => {
        if (event === "SIGNED_IN" || event === "USER_UPDATED") {
          supabase.auth.getUser().then(({ data: { user } }) => {
            if (user?.email_confirmed_at) {
              router.push("/dashboard");
              router.refresh();
            }
          });
        }
      }
    );
    return () => subscription.unsubscribe();
  }, [supabase, router]);

  const handleResend = async () => {
    if (!email) return;
    setError("");
    setLoading(true);

    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email,
    });

    setLoading(false);

    if (resendError) {
      setError("Не удалось отправить письмо. Подождите немного и попробуйте снова.");
      return;
    }

    setResent(true);
    setTimeout(() => setResent(false), 30000);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
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

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>

          <h2 className="text-lg font-semibold text-gray-900 mb-2">Подтвердите почту</h2>

          {email ? (
            <p className="text-sm text-gray-500 mb-1">
              Мы отправили письмо на
            </p>
          ) : null}
          {email && (
            <p className="text-sm font-semibold text-gray-800 mb-4">{email}</p>
          )}

          <p className="text-sm text-gray-400 mb-6 leading-relaxed">
            Перейдите по ссылке в письме, чтобы получить доступ к системе.
            <br />
            <span className="text-xs mt-1 block">Проверьте папку «Спам», если письмо не видно.</span>
          </p>

          {resent && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200 mb-4 text-left">
              <svg className="w-4 h-4 text-green-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span className="text-sm text-green-700">Письмо отправлено повторно</span>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-red-50 border border-red-200 mb-4 text-left">
              <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <span className="text-sm text-red-700">{error}</span>
            </div>
          )}

          <div className="space-y-3">
            <button
              onClick={handleResend}
              disabled={loading || resent || !email}
              className="w-full py-2.5 px-4 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Отправка..." : resent ? "Письмо отправлено" : "Отправить повторно"}
            </button>

            <button
              onClick={handleSignOut}
              className="w-full py-2.5 px-4 text-gray-400 text-sm hover:text-gray-600 transition-colors"
            >
              Выйти из аккаунта
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
