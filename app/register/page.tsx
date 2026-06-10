"use client";

import { useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { submitRegistration } from "./actions";

export default function RegisterPage() {
  const [form, setForm] = useState({ company_name: "", contact_name: "", email: "", phone: "" });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try { await submitRegistration(form); setDone(true); }
    catch (err) { setError(err instanceof Error ? err.message : "Ошибка отправки."); }
    finally { setLoading(false); }
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
          {done ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-[#00f5c4]/10 border border-[#00f5c4]/30 flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-[#00f5c4]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-[#ededed] mb-2">Заявка отправлена</h2>
              <p className="text-sm text-[#888888] mb-6">Мы свяжемся с вами в течение 24 часов.</p>
              <Link href="/login" className="text-sm text-[#888888] hover:text-[#00f5c4] transition-colors">
                Вернуться ко входу
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-[#ededed] mb-1">Оставить заявку</h2>
              <p className="text-sm text-[#888888] mb-6">Заполните форму — мы создадим аккаунт для вашей компании.</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                {[
                  { field: "company_name" as const, label: "Название компании", placeholder: "ООО «Стройматериалы»", required: true },
                  { field: "contact_name" as const, label: "Ваше имя", placeholder: "Иван Петров", required: true },
                  { field: "email" as const, label: "Email", placeholder: "ivan@company.com", required: true, type: "email" },
                  { field: "phone" as const, label: "Телефон", placeholder: "+7 (999) 000-00-00", required: false, type: "tel" },
                ].map(({ field, label, placeholder, required, type = "text" }) => (
                  <div key={field}>
                    <label className="block text-xs font-medium text-[#888888] mb-1.5">
                      {label} {required && <span className="text-red-400">*</span>}
                    </label>
                    <input type={type} value={form[field]} onChange={set(field)}
                      placeholder={placeholder} required={required} className="dp-input" />
                  </div>
                ))}
                {error && (
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">{error}</div>
                )}
                <button type="submit" disabled={loading} className="dp-btn-primary w-full py-2.5 mt-2">
                  {loading ? "Отправка…" : "Оставить заявку"}
                </button>
              </form>
              <p className="text-center text-sm text-[#888888] mt-6">
                Уже есть аккаунт?{" "}
                <Link href="/login" className="font-medium text-[#ededed] hover:text-[#00f5c4] transition-colors">Войти</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
