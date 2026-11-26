"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import { resendRegistrationCode, startRegistration, verifyRegistrationCode } from "./actions";

export default function RegisterPage() {
  const [form, setForm] = useState({
    company_name: "",
    contact_name: "",
    email: "",
    phone: "",
    password: "",
  });
  const [step, setStep] = useState<"form" | "code">("form");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const router = useRouter();

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);
    try {
      const result = await startRegistration(form);
      setStep("code");
      setInfo(`Код отправлен на ${result.email}. Действует 15 минут.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка регистрации.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await verifyRegistrationCode({ email: form.email, code, password: form.password });
      router.push("/onboarding/setup");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось проверить код.");
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError("");
    setInfo("");
    setResending(true);
    try {
      await resendRegistrationCode(form.email);
      setInfo("Новый код отправлен. Проверьте почту и папку «Спам».");
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
          {step === "form" ? (
            <>
              <h2 className="text-lg font-semibold text-[var(--text)] mb-1">Создать аккаунт</h2>
              <p className="text-sm text-[var(--muted)] mb-6">
                30 дней бесплатно, карта не нужна. Почту подтвердим кодом из письма.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                {[
                  { field: "company_name" as const, label: "Название компании", placeholder: "ТОО «Стройматериалы»", required: true },
                  { field: "contact_name" as const, label: "Ваше имя", placeholder: "Иван Петров", required: true },
                  { field: "email" as const, label: "Email", placeholder: "ivan@company.com", required: true, type: "email" },
                  { field: "phone" as const, label: "Телефон", placeholder: "+7 (700) 000-00-00", required: false, type: "tel" },
                ].map(({ field, label, placeholder, required, type = "text" }) => (
                  <div key={field}>
                    <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
                      {label} {required && <span className="text-red-400">*</span>}
                    </label>
                    <input
                      type={type}
                      value={form[field]}
                      onChange={set(field)}
                      placeholder={placeholder}
                      required={required}
                      autoComplete={field === "email" ? "email" : field === "phone" ? "tel" : field === "contact_name" ? "name" : "organization"}
                      className="dp-input"
                    />
                  </div>
                ))}

                <div>
                  <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
                    Пароль <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={set("password")}
                    placeholder="Минимум 8 символов"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className="dp-input"
                  />
                </div>

                {error && (
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">{error}</div>
                )}

                <button type="submit" disabled={loading} className="dp-btn-primary w-full py-2.5 mt-2">
                  {loading ? "Отправляем код…" : "Получить код"}
                </button>
              </form>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-[var(--text)] mb-1">Введите код из письма</h2>
              <p className="text-sm text-[var(--muted)] mb-6">
                Письмо ушло на {form.email}. Код из 6 цифр, действует 15 минут.
              </p>

              <form onSubmit={handleVerify} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Код</label>
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

                {info && (
                  <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-400">{info}</div>
                )}
                {error && (
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">{error}</div>
                )}

                <button type="submit" disabled={loading || code.length !== 6} className="dp-btn-primary w-full py-2.5">
                  {loading ? "Проверяем…" : "Подтвердить и войти"}
                </button>
              </form>

              <div className="flex items-center justify-between mt-4 text-sm">
                <button
                  type="button"
                  onClick={() => { setStep("form"); setError(""); setInfo(""); }}
                  className="text-[var(--muted)] hover:text-[var(--text)]"
                >
                  Изменить данные
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

          <p className="text-center text-sm text-[var(--muted)] mt-6">
            Уже есть аккаунт?{" "}
            <Link href="/login" className="font-medium text-[var(--text)] hover:text-[#2563eb] transition-colors">Войти</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
