"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { Logo } from "@/components/Logo";

export default function ResetPasswordPage() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "expired") {
      setReady(false);
      return;
    }
    const token_hash = params.get("token_hash");
    if (token_hash) {
      // Remove token from URL so refresh doesn't re-trigger verification
      window.history.replaceState({}, "", "/reset-password");
      supabase.auth
        .verifyOtp({ token_hash, type: "recovery" })
        .then(({ error: otpError }) => {
          setReady(!otpError);
        });
      return;
    }
    // No token: existing session check (e.g. page refresh after successful verification)
    supabase.auth.getSession().then(({ data: { session } }) => {
      setReady(!!session);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) return setError("Пароли не совпадают");
    if (password.length < 8) return setError("Минимум 8 символов");
    setLoading(true);
    setError("");
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) { setError(updateError.message); setLoading(false); }
    else { await supabase.auth.signOut(); router.push("/login?message=password_updated"); }
  }

  return (
    <div className="dp-auth-page">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4"><Logo size={48} /></div>
          <h1 className="text-2xl font-bold text-[#ededed]">AD Pulse</h1>
          <p className="text-sm text-[#888888] mt-1">Система учёта материалов</p>
        </div>

        <div className="dp-auth-card">
          {ready === null ? (
            <div className="text-center py-6 text-[#888888] text-sm">Проверяем сессию...</div>
          ) : !ready ? (
            <div className="text-center py-6">
              <p className="text-[#888888] text-sm mb-4">Ссылка недействительна или истекла.</p>
              <a href="/forgot-password" className="text-sm text-[#00f5c4] hover:underline">Запросить новую ссылку</a>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <h2 className="text-lg font-semibold text-[#ededed] mb-4">Новый пароль</h2>
              <div>
                <label className="block text-xs font-medium text-[#888888] mb-1.5">Новый пароль</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="Минимум 8 символов" className="dp-input" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#888888] mb-1.5">Подтвердите пароль</label>
                <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Повторите пароль" className="dp-input" />
              </div>
              {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">{error}</div>
              )}
              <button type="submit" disabled={loading} className="dp-btn-primary w-full py-2.5">
                {loading ? "Сохраняем..." : "Сохранить пароль"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
