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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          {!isPending && (
            <div className="mb-5 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-700">
              Эта заявка уже {reg.status === "approved" ? "одобрена" : "отклонена"}.
            </div>
          )}

          <h2 className="text-base font-semibold text-gray-900 mb-4">Данные заявки</h2>

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
              <div key={label} className="flex justify-between items-start gap-4 py-2.5 border-b border-gray-50 last:border-0">
                <span className="text-xs text-gray-400 shrink-0">{label}</span>
                <span className="text-sm text-gray-800 text-right break-all">{value}</span>
              </div>
            ))}
          </div>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}

          {isPending && (
            <div className="flex gap-3">
              <button
                onClick={handleReject}
                disabled={loading}
                className="flex-1 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-50 transition-colors"
              >
                Отклонить
              </button>

              <button
                onClick={handleApprove}
                disabled={loading}
                style={{
                  flex: 1,
                  background: "#05050a",
                  color: "#00f5c4",
                  padding: "14px 0",
                  borderRadius: "10px",
                  fontWeight: 600,
                  fontSize: "15px",
                  border: "none",
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.7 : 1,
                  transition: "opacity 0.15s",
                }}
              >
                {loading ? "Одобряем…" : "✓ Одобрить"}
              </button>
            </div>
          )}

          <div className="mt-5 text-center">
            <Link href="/admin/registrations" className="text-sm text-gray-400 hover:text-[#05050a] transition-colors">
              ← Все заявки
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
