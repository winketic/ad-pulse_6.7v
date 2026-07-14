"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveRegistration, rejectRegistration } from "@/app/admin/actions";

type Registration = {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  status: string;
  created_at: string;
};

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  pending:  { bg: "bg-amber-100",  text: "text-amber-700",  label: "Ожидает" },
  approved: { bg: "bg-green-100",  text: "text-green-700",  label: "Одобрено" },
  rejected: { bg: "bg-red-100",    text: "text-red-700",    label: "Отклонено" },
};

export default function AdminRegistrationsClient({ registrations }: { registrations: Registration[] }) {
  const [actionError, setActionError] = useState("");
  const [isPending, startTransition] = useTransition();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const router = useRouter();

  const handleApprove = (id: string) => {
    setLoadingId(id);
    setActionError("");
    startTransition(async () => {
      try {
        await approveRegistration(id);
        router.refresh();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "Ошибка");
      } finally {
        setLoadingId(null);
      }
    });
  };

  const handleReject = (id: string) => {
    setLoadingId(id);
    setActionError("");
    startTransition(async () => {
      try {
        await rejectRegistration(id);
        router.refresh();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "Ошибка");
      } finally {
        setLoadingId(null);
      }
    });
  };

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Заявки на подключение</h1>
        <p className="text-sm text-gray-400 mt-0.5">{registrations.length} заявок</p>
      </div>

      {actionError && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {registrations.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-sm text-gray-400">
          Заявок пока нет
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="hidden sm:grid grid-cols-[1fr_1fr_1fr_auto_auto] gap-4 px-5 py-3 bg-gray-50 border-b border-gray-100 text-xs font-medium text-gray-400 uppercase tracking-wide">
            <span>Компания / Контакт</span>
            <span>Email</span>
            <span>Дата</span>
            <span>Статус</span>
            <span></span>
          </div>

          <div className="divide-y divide-gray-50">
            {registrations.map((reg) => {
              const s = STATUS_STYLE[reg.status] ?? STATUS_STYLE.pending;
              const isLoading = loadingId === reg.id && isPending;
              return (
                <div key={reg.id} className="px-5 py-4 sm:grid sm:grid-cols-[1fr_1fr_1fr_auto_auto] sm:gap-4 sm:items-center space-y-2 sm:space-y-0">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{reg.company_name}</p>
                    <p className="text-xs text-gray-400">{reg.contact_name}{reg.phone ? ` · ${reg.phone}` : ""}</p>
                  </div>
                  <p className="text-sm text-gray-600 truncate">{reg.email}</p>
                  <p className="text-xs text-gray-400">
                    {new Date(reg.created_at).toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" })}
                  </p>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${s.bg} ${s.text}`}>
                    {s.label}
                  </span>
                  {reg.status === "pending" && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApprove(reg.id)}
                        disabled={isLoading}
                        className="px-3 py-1.5 rounded-lg bg-[#05050a] text-[#00f5c4] text-xs font-semibold hover:bg-[#1a1a2e] disabled:opacity-50 transition-colors"
                      >
                        {isLoading ? "…" : "Одобрить"}
                      </button>
                      <button
                        onClick={() => handleReject(reg.id)}
                        disabled={isLoading}
                        className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-50 transition-colors"
                      >
                        Отклонить
                      </button>
                    </div>
                  )}
                  {reg.status !== "pending" && <div />}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
