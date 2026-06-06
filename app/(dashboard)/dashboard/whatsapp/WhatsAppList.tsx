"use client";

import { useState, useTransition } from "react";
import { confirmWhatsAppTransaction, rejectWhatsAppMessage, type TxType } from "./actions";

type ParseResult = {
  type: TxType | null;
  quantity: number | null;
  unit: string | null;
  material_id: string | null;
  material_name: string | null;
  confidence: "high" | "low";
  transaction_created: boolean;
};

export type WazzupMessage = {
  id: string;
  sender_phone: string | null;
  raw_text: string | null;
  parsed: boolean;
  needs_review: boolean;
  parse_result: ParseResult | null;
  created_at: string;
};

export type WazzupMaterial = {
  id: string;
  name: string;
  unit: string;
};

const TX_TYPE_LABELS: Record<TxType, string> = {
  income: "Приход",
  expense: "Расход",
  defect: "Брак",
  return: "Возврат",
};

function messageStatus(msg: WazzupMessage): "green" | "yellow" | "gray" {
  if (!msg.parsed) return "gray";
  if (msg.needs_review) return "yellow";
  return "green";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncate(text: string | null, len = 80) {
  if (!text) return "—";
  return text.length > len ? text.slice(0, len) + "…" : text;
}

// ── Confirm modal ──────────────────────────────────────────

function ConfirmModal({
  message,
  materials,
  onClose,
}: {
  message: WazzupMessage;
  materials: WazzupMaterial[];
  onClose: () => void;
}) {
  const pr = message.parse_result;
  const [type, setType] = useState<TxType>(pr?.type ?? "income");
  const [materialId, setMaterialId] = useState(pr?.material_id ?? "");
  const [quantity, setQuantity] = useState(String(pr?.quantity ?? ""));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const qty = parseFloat(quantity.replace(",", "."));
    if (isNaN(qty) || qty <= 0) {
      setError("Введите корректное количество");
      return;
    }
    if (!materialId) {
      setError("Выберите материал");
      return;
    }

    startTransition(async () => {
      try {
        await confirmWhatsAppTransaction({
          messageId: message.id,
          materialId,
          type,
          quantity: qty,
        });
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка сохранения");
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            Подтвердить транзакцию
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Original message */}
        <div className="px-5 pt-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
            Сообщение
          </p>
          <p className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2 leading-relaxed">
            {message.raw_text || "—"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Тип операции
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as TxType)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a472a]/30 focus:border-[#1a472a]"
            >
              {(Object.entries(TX_TYPE_LABELS) as [TxType, string][]).map(
                ([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                )
              )}
            </select>
          </div>

          {/* Material */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Материал
            </label>
            <select
              value={materialId}
              onChange={(e) => setMaterialId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a472a]/30 focus:border-[#1a472a]"
            >
              <option value="">— выберите —</option>
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.unit})
                </option>
              ))}
            </select>
          </div>

          {/* Quantity */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Количество
              {pr?.unit && (
                <span className="ml-1 font-normal text-gray-400">
                  ({pr.unit})
                </span>
              )}
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a472a]/30 focus:border-[#1a472a]"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex-1 px-4 py-2 rounded-lg bg-[#1a472a] text-white text-sm font-medium hover:bg-[#1a472a]/90 disabled:opacity-50 transition-colors"
            >
              {pending ? "Сохранение…" : "Сохранить"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────

function StatusBadge({ status }: { status: "green" | "yellow" | "gray" }) {
  if (status === "green") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 text-green-700 text-xs font-medium">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        Распознано
      </span>
    );
  }
  if (status === "yellow") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700 text-xs font-medium">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M12 5a7 7 0 100 14A7 7 0 0012 5z" />
        </svg>
        Требует проверки
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-xs font-medium">
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
      Не распознано
    </span>
  );
}

// ── Main component ────────────────────────────────────────

export default function WhatsAppList({
  messages,
  materials,
}: {
  messages: WazzupMessage[];
  materials: WazzupMaterial[];
}) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectPending, startRejectTransition] = useTransition();

  const confirmingMessage = confirmingId
    ? messages.find((m) => m.id === confirmingId) ?? null
    : null;

  const handleReject = (id: string) => {
    setRejectingId(id);
    startRejectTransition(async () => {
      try {
        await rejectWhatsAppMessage(id);
      } finally {
        setRejectingId(null);
      }
    });
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">WhatsApp</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Входящие сообщения и автоматически созданные транзакции
        </p>
      </div>

      {messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <p className="text-gray-500 text-sm">Сообщений пока нет</p>
          <p className="text-gray-400 text-xs mt-1">
            Подключите WhatsApp в Настройках, чтобы начать получать сообщения
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-36">
                    Дата
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-28">
                    Отправитель
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Сообщение
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-40">
                    Статус
                  </th>
                  <th className="px-4 py-3 w-28" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {messages.map((msg) => {
                  const status = messageStatus(msg);
                  const pr = msg.parse_result;
                  return (
                    <tr key={msg.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {formatDate(msg.created_at)}
                      </td>
                      <td className="px-4 py-3 text-gray-700 text-xs whitespace-nowrap">
                        {msg.sender_phone || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-gray-800">{truncate(msg.raw_text)}</p>
                        {pr && (pr.type || pr.material_name || pr.quantity) && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            {[
                              pr.type ? TX_TYPE_LABELS[pr.type] : null,
                              pr.material_name,
                              pr.quantity != null
                                ? `${pr.quantity}${pr.unit ? " " + pr.unit : ""}`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        {status === "yellow" && (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setConfirmingId(msg.id)}
                              className="px-3 py-1.5 rounded-lg bg-yellow-50 text-yellow-800 text-xs font-medium hover:bg-yellow-100 transition-colors border border-yellow-200"
                            >
                              Подтвердить
                            </button>
                            <button
                              onClick={() => handleReject(msg.id)}
                              disabled={rejectPending && rejectingId === msg.id}
                              className="px-3 py-1.5 rounded-lg bg-gray-50 text-gray-500 text-xs font-medium hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors border border-gray-200 disabled:opacity-50"
                            >
                              {rejectPending && rejectingId === msg.id
                                ? "…"
                                : "Отклонить"}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {confirmingMessage && (
        <ConfirmModal
          message={confirmingMessage}
          materials={materials}
          onClose={() => setConfirmingId(null)}
        />
      )}
    </div>
  );
}
