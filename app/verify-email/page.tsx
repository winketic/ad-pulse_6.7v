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

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setEmail(user.email);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        supabase.auth.getUser().then(({ data: { user } }) => {
          if (user?.email_confirmed_at) { router.push("/dashboard"); router.refresh(); }
        });
      }
    });
    return () => subscription.unsubscribe();
  }, [supabase, router]);

  const handleResend = async () => {
    if (!email) return;
    setError("");
    setLoading(true);
    const { error: resendError } = await supabase.auth.resend({ type: "signup", email });
    setLoading(false);
    if (resendError) { setError("Не удалось отправить письмо. Подождите немного."); return; }
    setResent(true);
    setTimeout(() => setResent(false), 30000);
  };

  return (
    <div className="dp-auth-page">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4"><Logo size={48} /></div>
          <h1 className="text-2xl font-bold text-[#ededed]">AD Pulse</h1>
          <p className="text-sm text-[#888888] mt-1">Система учёта материалов</p>
        </div>
        <div className="dp-auth-card text-center">
          <div className="w-12 h-12 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-[#ededed] mb-2">Подтвердите почту</h2>
          {email && <p className="text-sm text-[#888888] mb-1">Письмо отправлено на</p>}
          {email && <p className="text-sm font-medium text-[#ededed] mb-4">{email}</p>}
          <p className="text-sm text-[#888888] mb-6 leading-relaxed">
            Перейдите по ссылке в письме для доступа к системе.
            <span className="block text-xs mt-1">Проверьте папку «Спам».</span>
          </p>
          {resent && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-[#00f5c4]/10 border border-[#00f5c4]/30 mb-4 text-left">
              <svg className="w-4 h-4 text-[#00f5c4] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-sm text-[#00f5c4]">Письмо отправлено повторно</span>
            </div>
          )}
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 mb-4 text-sm text-red-400 text-left">{error}</div>
          )}
          <div className="space-y-3">
            <button onClick={handleResend} disabled={loading || resent || !email}
              className="dp-btn-secondary w-full py-2.5">
              {loading ? "Отправка..." : resent ? "Письмо отправлено" : "Отправить повторно"}
            </button>
            <button onClick={() => supabase.auth.signOut().then(() => router.push("/login"))}
              className="w-full py-2 text-sm text-[#888888] hover:text-[#ededed] transition-colors">
              Выйти из аккаунта
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
