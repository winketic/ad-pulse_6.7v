"use client";

import { useState } from "react";
import { sendSupportMessage } from "./actions";

type TicketRow = { id: string; subject: string; status: string; created_at: string };

const STATUS_LABEL: Record<string, string> = {
  new: "Новое",
  answered: "Ответили",
  closed: "Закрыто",
};

export default function SupportClient({
  email,
  name,
  tickets,
}: {
  email: string;
  name: string;
  tickets: TicketRow[];
}) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<{ emailSent: boolean } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSent(null);
    setBusy(true);
    try {
      const result = await sendSupportMessage({ subject, message });
      setSent({ emailSent: result.emailSent });
      setSubject("");
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отправить обращение.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-display text-[var(--text)]">Поддержка</h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Напишите нам — ответ приходит на {email || "вашу почту"}. Обычно в течение рабочего дня.
        </p>
      </div>

      <section className="rounded-2xl p-5" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Тема</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              minLength={3}
              maxLength={160}
              placeholder="Не приходит письмо, вопрос по счёту…"
              className="dp-input"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Сообщение</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              minLength={10}
              maxLength={4000}
              rows={6}
              placeholder="Опишите, что произошло и что вы ожидали. Чем точнее, тем быстрее разберёмся."
              className="dp-input resize-y"
            />
            <p className="text-xs text-[var(--muted)] mt-1">{message.length} / 4000</p>
          </div>

          {error && (
            <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "color-mix(in srgb, #dc2626 10%, transparent)", border: "1px solid color-mix(in srgb, #dc2626 30%, transparent)" }}>
              {error}
            </div>
          )}

          {sent && (
            <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "color-mix(in srgb, #059669 10%, transparent)", border: "1px solid color-mix(in srgb, #059669 30%, transparent)" }}>
              {sent.emailSent
                ? "Обращение отправлено. Ответ придёт на вашу почту."
                : "Обращение сохранено, но письмо не ушло — мы увидим его в системе."}
            </div>
          )}

          <button type="submit" disabled={busy} className="dp-btn-primary px-5 py-2.5 disabled:opacity-50">
            {busy ? "Отправляем…" : "Отправить"}
          </button>
        </form>
      </section>

      {tickets.length > 0 && (
        <section className="rounded-2xl p-5" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <h2 className="text-base font-semibold text-[var(--text)] mb-3">Последние обращения</h2>
          <div className="space-y-2">
            {tickets.map((ticket) => (
              <div
                key={ticket.id}
                className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5"
                style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
              >
                <div className="min-w-0">
                  <p className="text-sm text-[var(--text)] truncate">{ticket.subject}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {new Date(ticket.created_at).toLocaleDateString("ru-RU", { day: "2-digit", month: "long" })}
                  </p>
                </div>
                <span className="text-xs text-[var(--muted)]">{STATUS_LABEL[ticket.status] ?? ticket.status}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="text-xs text-[var(--muted)]">
        Обращения уходят на altai.dx@gmail.com. Если почта недоступна, напишите напрямую на этот адрес.
        {name ? ` Подпись: ${name}.` : ""}
      </p>
    </div>
  );
}
