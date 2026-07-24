"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Registration = {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  status: string;
  created_at: string;
};

export default function AdminApproveClient({ registration: reg }: { registration: Registration }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [, startTransition] = useTransition();
  const router = useRouter();

  async function handleApprove() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId: reg.id }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        startTransition(() => router.push("/admin/registrations?approved=true"));
      }
    } catch {
      setError("Ошибка при одобрении. Попробуйте снова.");
    }
    setLoading(false);
  }

  async function handleReject() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId: reg.id }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        startTransition(() => router.push("/admin/registrations?rejected=true"));
      }
    } catch {
      setError("Ошибка при отклонении.");
    }
    setLoading(false);
  }

  const isPending = reg.status === "pending";

  return (
    <div className="dp-auth-page">
      <div className="w-full max-w-md relative z-[1]">
        <div className="dp-auth-card">
          {!isPending && (
            <div className="mb-5 px-4 py-3 rounded-lg bg-[var(--warning-bg)] border border-[var(--warning)]/25 text-sm text-[var(--warning)]">
              Эта заявка уже {reg.status === "approved" ? "одобрена" : "отклонена"}.
            </div>
          )}

          <h2 className="text-base font-semibold text-[var(--text)] mb-4">Данные заявки</h2>

          <div className="mb-6">
            {[
              { label: "Компания", value: reg.company_name },
              { label: "Контакт", value: reg.contact_name },
              { label: "Email", value: reg.email },
              { label: "Телефон", value: reg.phone || "—" },
              {
                label: "Дата",
                value: new Date(reg.created_at).toLocaleDateString("ru-RU", {
                  day: "2-digit", month: "long", year: "numeric",
                }),
              },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between items-start gap-4 py-2.5 border-b border-[var(--border)] last:border-0">
                <span className="text-xs text-[var(--muted)] shrink-0">{label}</span>
                <span className="text-sm text-[var(--text)] text-right break-all">{value}</span>
              </div>
            ))}
          </div>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-[var(--danger-bg)] border border-[var(--danger)]/25 text-sm text-[var(--danger)]">
              {error}
            </div>
          )}

          {isPending && (
            <div className="flex gap-3">
              <button
                onClick={handleReject}
                disabled={loading}
                className="dp-btn-danger flex-1"
              >
                Отклонить
              </button>

              <button
                onClick={handleApprove}
                disabled={loading}
                className="dp-btn-primary flex-1"
              >
                {loading ? "Одобряем…" : "✓ Одобрить"}
              </button>
            </div>
          )}

          <div className="mt-5 text-center">
            <Link href="/admin/registrations" className="text-sm text-[var(--muted)] hover:text-[var(--accent)] transition-colors">
              ← Все заявки
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
