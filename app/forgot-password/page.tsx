"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import { requestPasswordResetCode, resetPasswordWithCode } from "./actions";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<"email" | "reset">("email");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const router = useRouter();

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);
    try {
      const result = await requestPasswordResetCode(email);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setStep("reset");
      setInfo(`Если аккаунт с адресом ${email} есть, код уже в письме. Действует 15 минут.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отправить код.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await resetPasswordWithCode({ email, code, password });
      if (!result.ok) {
        setError(result.error);
        setLoading(false);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сменить пароль.");
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError("");
    setResending(true);
    try {
      const result = await requestPasswordResetCode(email);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setInfo("Код отправлен ещё раз. Проверьте почту и папку «Спам».");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отправить код.");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="dp-auth-page">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4"><Logo size={48} /></div>
          <h1 className="text-2xl font-bold text-[var(--text)] tracking-tight">AD Pulse</h1>
          <p className="text-sm text-[var(--muted)] mt-1">Система учёта материалов</p>
        </div>

        <div className="dp-auth-card">
          {step === "email" ? (
            <>
              <h2 className="text-lg font-semibold text-[var(--text)] mb-2">Сброс пароля</h2>
              <p className="text-sm text-[var(--muted)] mb-6">
                Введите email — пришлём код из 6 цифр. Пароль меняется здесь же.
              </p>
              <form onSubmit={handleRequest} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    required
                    autoComplete="email"
                    className="dp-input"
                  />
                </div>
                {error && (
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">{error}</div>
                )}
                <button type="submit" disabled={loading} className="dp-btn-primary w-full py-2.5">
                  {loading ? "Отправляем…" : "Получить код"}
                </button>
              </form>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-[var(--text)] mb-2">Новый пароль</h2>
              <p className="text-sm text-[var(--muted)] mb-6">
                Код ушёл на {email}. Введите его и новый пароль.
              </p>
              <form onSubmit={handleReset} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Код из письма</label>
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="123456"
                    required
                    className="dp-input text-center tracking-[0.5em] text-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Новый пароль</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Минимум 8 символов"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className="dp-input"
                  />
                </div>

                {info && (
                  <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-400">{info}</div>
                )}
                {error && (
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">{error}</div>
                )}

                <button type="submit" disabled={loading || code.length !== 6} className="dp-btn-primary w-full py-2.5">
                  {loading ? "Меняем пароль…" : "Сменить пароль и войти"}
                </button>
              </form>

              <div className="flex items-center justify-between mt-4 text-sm">
                <button
                  type="button"
                  onClick={() => { setStep("email"); setError(""); setInfo(""); }}
                  className="text-[var(--muted)] hover:text-[var(--text)]"
                >
                  Изменить email
                </button>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resending}
                  className="text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-50"
                >
                  {resending ? "Отправляем…" : "Отправить код ещё раз"}
                </button>
              </div>
            </>
          )}

          <div className="mt-5 text-center">
            <Link href="/login" className="text-sm text-[var(--muted)] hover:text-[#2563eb] transition-colors">
              Вернуться ко входу
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
