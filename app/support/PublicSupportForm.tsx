"use client";

import { useState } from "react";
import { sendPublicSupportMessage } from "./actions";

export default function PublicSupportForm() {
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await sendPublicSupportMessage(form);
      setSent(true);
      setForm({ name: "", email: "", subject: "", message: "", website: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отправить обращение.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="dp-auth-card text-center">
        <h2 className="text-lg font-semibold text-[var(--text)] mb-2">Обращение отправлено</h2>
        <p className="text-sm text-[var(--muted)]">
          Ответ придёт на указанную почту. Если письмо не пришло, проверьте папку «Спам».
        </p>
      </div>
    );
  }

  return (
    <div className="dp-auth-card">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Ваше имя</label>
          <input value={form.name} onChange={set("name")} maxLength={120} className="dp-input" placeholder="Иван Петров" />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Email для ответа</label>
          <input value={form.email} onChange={set("email")} type="email" required className="dp-input" placeholder="ivan@company.com" />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Тема</label>
          <input value={form.subject} onChange={set("subject")} required minLength={3} maxLength={160} className="dp-input" placeholder="Вопрос по подключению" />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Сообщение</label>
          <textarea value={form.message} onChange={set("message")} required minLength={10} maxLength={4000} rows={6} className="dp-input resize-y" placeholder="Опишите вопрос" />
        </div>

        {/* Ловушка для ботов: не показываем людям */}
        <input
          value={form.website}
          onChange={set("website")}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          style={{ position: "absolute", left: "-9999px", height: 1, width: 1, opacity: 0 }}
        />

        {error && (
          <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "color-mix(in srgb, #dc2626 10%, transparent)", border: "1px solid color-mix(in srgb, #dc2626 30%, transparent)" }}>
            {error}
          </div>
        )}

        <button type="submit" disabled={busy} className="dp-btn-primary w-full py-2.5 disabled:opacity-50">
          {busy ? "Отправляем…" : "Отправить"}
        </button>
      </form>
      <p className="text-xs text-[var(--muted)] mt-4">
        Отвечаем на указанный email, обычно в течение рабочего дня.
      </p>
    </div>
  );
}
