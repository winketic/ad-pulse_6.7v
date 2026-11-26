"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import { registerCompany } from "./actions";

export default function RegisterPage() {
  const [form, setForm] = useState({
    company_name: "",
    contact_name: "",
    email: "",
    phone: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await registerCompany(form);
      if (result.existingAccount) {
        setError("Аккаунт с этим email уже есть. Войдите или восстановите пароль.");
        return;
      }
      if (result.needsConfirmation) {
        router.push("/verify-email");
        return;
      }
      router.push("/onboarding/setup");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка регистрации.");
    } finally {
      setLoading(false);
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
          <h2 className="text-lg font-semibold text-[var(--text)] mb-1">Создать аккаунт</h2>
          <p className="text-sm text-[var(--muted)] mb-6">
            30 дней бесплатно, карта не нужна. Компания и пилот создаются сразу.
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
              {loading ? "Создаём…" : "Начать бесплатно"}
            </button>
          </form>

          <p className="text-center text-sm text-[var(--muted)] mt-6">
            Уже есть аккаунт?{" "}
            <Link href="/login" className="font-medium text-[var(--text)] hover:text-[#2563eb] transition-colors">Войти</Link>
          </p>
          <p className="text-center text-xs text-[var(--muted)] mt-3">
            Нужна помощь? <Link href="/support" className="underline hover:text-[var(--text)]">Написать в поддержку</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
