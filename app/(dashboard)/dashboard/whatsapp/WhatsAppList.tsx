"use client";

import { useState, useEffect, useTransition } from "react";
import { createClient } from "@/utils/supabase/client";
import { confirmWhatsAppTransaction, rejectWhatsAppMessage, type TxType } from "./actions";
import AllowedChatsCard from "@/components/settings/AllowedChatsCard";
import ResubscribeButton from "@/components/settings/ResubscribeButton";

// ── Types ─────────────────────────────────────────────────

type ParseResult = {
  type: TxType | null;
  quantity: number | null;
  unit: string | null;
  material_id: string | null;
  material_name: string | null;
  note: string | null;
  confidence: "high" | "low";
  transaction_created: boolean;
};

export type WazzupMessage = {
  id: string;
  chat_id: string | null;
  sender_phone: string | null;
  raw_text: string | null;
  parsed: boolean;
  needs_review: boolean;
  parse_result: ParseResult | null;
  created_at: string;
  content_type: string | null;
  media_url: string | null;
};

export type WazzupMaterial = {
  id: string;
  name: string;
  unit: string;
};

type QueueTab = "queue" | "chats";

const TABS: { id: QueueTab; label: string }[] = [
  { id: "queue", label: "Очередь" },
  { id: "chats", label: "Разрешённые чаты" },
];

const TX_TYPE_LABELS: Record<TxType, string> = {
  income:  "Приход",
  expense: "Расход",
  defect:  "Брак",
  return:  "Возврат",
};

const TX_TYPE_COLORS: Record<TxType, string> = {
  income:  "text-[var(--success)]",
  expense: "text-[var(--warning)]",
  defect:  "text-[var(--danger)]",
  return:  "text-[var(--info)]",
};

// ── Helpers ───────────────────────────────────────────────

function messageStatus(msg: WazzupMessage): "green" | "yellow" | "gray" {
  if (!msg.parsed) return "gray";
  if (msg.needs_review) return "yellow";
  return "green";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function truncate(text: string | null, len = 80) {
  if (!text) return "—";
  return text.length > len ? text.slice(0, len) + "…" : text;
}

// ── Status badge ──────────────────────────────────────────

function StatusBadge({ status }: { status: "green" | "yellow" | "gray" }) {
  const config =
    status === "green"
      ? {
          label: "Создано",
          color: "var(--success)",
          background: "var(--success-bg)",
          border: "color-mix(in srgb, var(--success) 24%, transparent)",
          icon: "M5 13l4 4L19 7",
        }
      : status === "yellow"
        ? {
            label: "Проверка",
            color: "var(--warning)",
            background: "var(--warning-bg)",
            border: "color-mix(in srgb, var(--warning) 24%, transparent)",
            icon: "M12 9v2m0 4h.01",
          }
        : {
            label: "Не распознано",
            color: "var(--muted)",
            background: "var(--bg3)",
            border: "var(--border)",
            icon: "M6 18L18 6M6 6l12 12",
          };

  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap shrink-0"
      style={{ color: config.color, background: config.background, border: `1px solid ${config.border}` }}
    >
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d={config.icon} />
      </svg>
      {config.label}
    </span>
  );
}

// ── Numbered explainer (shared by both empty states) ──────

function InfoSteps({ steps }: { steps: { title: string; text: string }[] }) {
  return (
    <ol className="grid gap-2.5 sm:grid-cols-3 text-left">
      {steps.map((step, i) => (
        <li
          key={step.title}
          className="rounded-lg p-3.5"
          style={{ background: "var(--bg3)", border: "1px solid var(--border)" }}
        >
          <span
            className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold mb-2"
            style={{ background: "var(--accent-15)", color: "var(--accent)" }}
          >
            {i + 1}
          </span>
          <p className="text-xs font-semibold text-[var(--text)]">{step.title}</p>
          <p className="text-[11px] text-[var(--muted)] mt-1 leading-relaxed">{step.text}</p>
        </li>
      ))}
    </ol>
  );
}

const CARD_STYLE = { background: "var(--card)", border: "1px solid var(--border)" } as const;

// ── Confirm modal (dark) ──────────────────────────────────

function ConfirmModal({
  message,
  materials,
  onClose,
  onSuccess,
}: {
  message: WazzupMessage;
  materials: WazzupMaterial[];
  onClose: () => void;
  onSuccess: (messageId: string) => void;
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
    if (isNaN(qty) || qty <= 0) { setError("Введите корректное количество"); return; }
    if (!materialId) { setError("Выберите материал"); return; }
    startTransition(async () => {
      try {
        await confirmWhatsAppTransaction({ messageId: message.id, materialId, type, quantity: qty });
        onSuccess(message.id);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка сохранения");
      }
    });
  };

  // Lock body scroll while open — prevents the page behind from scrolling/
  // bouncing (and the modal appearing to "jump") when the mobile keyboard opens.
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        onTouchMove={(e) => e.preventDefault()}
      />
      <div className="relative rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[92dvh] flex flex-col" style={CARD_STYLE}>
        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
          <h2 className="text-sm font-semibold text-[var(--text)]">Подтвердить транзакцию</h2>
          <button onClick={onClose} className="p-1 rounded-lg text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--bg3)] transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 min-h-0">
          <div className="px-5 pt-4">
            <p className="text-xs font-medium text-[var(--muted)] mb-1.5">Исходное сообщение</p>
            <p className="text-sm text-[var(--text)] rounded-lg px-3 py-2.5 leading-relaxed break-words"
              style={{ background: "var(--bg3)", border: "1px solid var(--border)" }}>
              {message.raw_text || "—"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
            <div>
              <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Тип операции</label>
              <select value={type} onChange={(e) => setType(e.target.value as TxType)}
                className="field-input">
                {(Object.entries(TX_TYPE_LABELS) as [TxType, string][]).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Материал</label>
              <select value={materialId} onChange={(e) => setMaterialId(e.target.value)}
                className="field-input">
                <option value="">— выберите —</option>
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
                Количество{pr?.unit && <span className="ml-1 font-normal text-[var(--muted)]">({pr.unit})</span>}
              </label>
              <input type="text" inputMode="decimal" value={quantity}
                onChange={(e) => setQuantity(e.target.value)} placeholder="0" className="field-input" />
            </div>

            {error && (
              <p className="text-xs text-red-400 rounded-lg px-3 py-2"
                style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                {error}
              </p>
            )}

            <div
              className="flex gap-3 pt-3 sticky bottom-0 -mx-5 -mb-4 px-5 pb-[calc(80px+env(safe-area-inset-bottom,0px))] sm:pb-4 border-t"
              style={{ background: "var(--card)", borderColor: "var(--border)" }}
            >
              <button type="button" onClick={onClose} className="dp-btn-secondary flex-1">Отмена</button>
              <button type="submit" disabled={pending} className={`dp-btn-primary flex-1${pending ? " btn-progress" : ""}`}>
                {pending ? "Сохранение…" : "Сохранить"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── Message detail drawer ─────────────────────────────────

function MessageDetailDrawer({
  message,
  senderMap,
  onClose,
  onOpenConfirm,
  onReject,
  rejectPending,
  rejectingId,
}: {
  message: WazzupMessage;
  senderMap: Record<string, { name: string; position: string | null }>;
  onClose: () => void;
  onOpenConfirm: (id: string) => void;
  onReject: (id: string) => void;
  rejectPending: boolean;
  rejectingId: string | null;
}) {
  const pr = message.parse_result;
  const status = messageStatus(message);
  const sender = message.sender_phone ? senderMap[message.sender_phone] : null;
  const isRejectingThis = rejectPending && rejectingId === message.id;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-in" onClick={onClose} />
      <div
        className="fixed right-0 top-0 h-full w-full sm:w-[420px] max-w-full z-50 flex flex-col drawer-in"
        style={{ background: "var(--bg)", borderLeft: "1px solid var(--border)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-4 shrink-0"
          style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={onClose}
              className="p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--bg3)] transition-colors shrink-0">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <StatusBadge status={status} />
          </div>
          <span className="text-xs text-[var(--muted)] whitespace-nowrap">{formatDate(message.created_at)}</span>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-5 space-y-5">

          {/* Sender */}
          <div>
            <p className="text-xs font-medium text-[var(--muted)] mb-1.5">Отправитель</p>
            {sender ? (
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--text)] truncate">{sender.name}</p>
                {sender.position && <p className="text-xs text-[var(--muted)] mt-0.5 truncate">{sender.position}</p>}
                <p className="text-xs text-[var(--muted)] mt-0.5 font-mono truncate">{message.sender_phone}</p>
              </div>
            ) : (
              <p className="text-sm text-[var(--text)] font-mono truncate">{message.sender_phone || "—"}</p>
            )}
          </div>

          {/* Raw message */}
          <div>
            <p className="text-xs font-medium text-[var(--muted)] mb-1.5">Исходное сообщение</p>
            <div className="rounded-xl px-4 py-3" style={CARD_STYLE}>
              <p className="text-sm text-[var(--text)] leading-relaxed whitespace-pre-wrap break-words">
                {message.raw_text || "—"}
              </p>
            </div>
          </div>

          {/* Image preview */}
          {message.content_type === "image" && message.media_url && (
            <div>
              <p className="text-xs font-medium text-[var(--muted)] mb-1.5">Изображение</p>
              <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={message.media_url}
                  alt="Вложение"
                  className="w-full max-h-64 object-contain"
                  style={{ background: "var(--card)" }}
                />
              </div>
            </div>
          )}

          {/* Parse result */}
          {pr && (pr.type || pr.material_name || pr.quantity != null) && (
            <div>
              <p className="text-xs font-medium text-[var(--muted)] mb-1.5">Результат парсинга</p>
              <div className="rounded-xl px-4 py-3 space-y-2.5" style={CARD_STYLE}>
                {pr.type && (
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs text-[var(--muted)] shrink-0">Тип операции</span>
                    <span className={`text-xs font-semibold ${TX_TYPE_COLORS[pr.type]}`}>
                      {TX_TYPE_LABELS[pr.type]}
                    </span>
                  </div>
                )}
                {pr.material_name && (
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs text-[var(--muted)] shrink-0">Материал</span>
                    <span className="text-xs text-[var(--text)] font-medium text-right break-words min-w-0">{pr.material_name}</span>
                  </div>
                )}
                {pr.quantity != null && (
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs text-[var(--muted)] shrink-0">Количество</span>
                    <span className="text-xs text-[var(--text)] font-medium">
                      {pr.quantity}{pr.unit ? " " + pr.unit : ""}
                    </span>
                  </div>
                )}
                {pr.note && (
                  <>
                    <div className="h-px" style={{ background: "var(--border)" }} />
                    <div>
                      <span className="text-xs text-[var(--muted)]">Примечание</span>
                      <p className="text-xs text-[var(--muted)] mt-1 leading-relaxed break-words">{pr.note}</p>
                    </div>
                  </>
                )}
                <div className="flex items-center justify-between gap-4 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
                  <span className="text-xs text-[var(--muted)]">Уверенность</span>
                  <span className={`text-xs font-medium ${pr.confidence === "high" ? "text-[var(--success)]" : "text-[var(--warning)]"}`}>
                    {pr.confidence === "high" ? "Высокая" : "Низкая"}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Go to transaction */}
          {pr?.transaction_created && (
            <a
              href={`/dashboard/transactions?wazzup_message_id=${message.id}`}
              className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors"
              style={{ background: "var(--accent-15)", border: "1px solid var(--border)", color: "var(--accent)" }}
            >
              <span>Перейти к транзакции</span>
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          )}

          {/* Confirm / Reject */}
          {status === "yellow" && (
            <div className="space-y-2 pt-1">
              <button
                onClick={() => onOpenConfirm(message.id)}
                className="dp-btn-primary w-full py-2.5"
              >
                Подтвердить транзакцию
              </button>
              <button
                onClick={() => onReject(message.id)}
                disabled={isRejectingThis}
                className="dp-btn-danger w-full py-2.5 disabled:opacity-50"
              >
                {isRejectingThis ? "Отклоняем…" : "Отклонить"}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Queue items ───────────────────────────────────────────

function CopyIcon() {
  return (
    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}

function MessageCard({
  message,
  sender,
  onSelect,
  onConfirm,
  onCopyChatId,
}: {
  message: WazzupMessage;
  sender: { name: string; position: string | null } | null;
  onSelect: () => void;
  onConfirm: () => void;
  onCopyChatId: (chatId: string) => void;
}) {
  const pr = message.parse_result;
  const status = messageStatus(message);
  const chatId = message.chat_id;
  const parsedSummary = [
    pr?.type ? TX_TYPE_LABELS[pr.type] : null,
    pr?.material_name,
    pr?.quantity != null ? `${pr.quantity}${pr.unit ? " " + pr.unit : ""}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="rounded-xl overflow-hidden card-lift" style={CARD_STYLE}>
      <button
        type="button"
        onClick={onSelect}
        className="block w-full text-left px-4 pt-3.5 pb-3 hover:bg-[var(--bg3)] transition-colors"
      >
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-[var(--text)] truncate">
              {sender?.name || message.sender_phone || "—"}
            </span>
            {sender?.position && (
              <span className="block text-[11px] text-[var(--muted)] truncate mt-0.5">{sender.position}</span>
            )}
            <span className="block text-[11px] text-[var(--muted)] mt-1">{formatDate(message.created_at)}</span>
          </span>
          <StatusBadge status={status} />
        </span>

        <span className="block text-sm text-[var(--text)] mt-2 line-clamp-2 break-words">
          {message.raw_text || "—"}
        </span>

        {parsedSummary && (
          <span className="block text-xs text-[var(--muted)] mt-1.5 truncate">{parsedSummary}</span>
        )}
      </button>

      <div
        className="flex items-center gap-2 px-3 sm:px-4 py-2"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        {chatId ? (
          <button
            type="button"
            onClick={() => onCopyChatId(chatId)}
            title="Скопировать Chat ID"
            className="flex items-center gap-1.5 min-w-0 text-[11px] sm:text-xs font-mono text-[var(--muted)] hover:text-[var(--accent)] transition-colors"
          >
            <CopyIcon />
            <span className="truncate">{chatId}</span>
          </button>
        ) : (
          <span className="text-[11px] sm:text-xs text-[var(--muted)]">Без чата</span>
        )}

        <div className="flex-1" />

        {status === "yellow" && (
          <button
            type="button"
            onClick={onConfirm}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 transition-colors"
            style={{ background: "var(--accent)", color: "var(--accent-text)" }}
          >
            Проверить
          </button>
        )}
      </div>
    </div>
  );
}

function ProcessedRow({
  message,
  sender,
  onSelect,
}: {
  message: WazzupMessage;
  sender: { name: string; position: string | null } | null;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[var(--bg3)] transition-colors border-b border-[var(--border)] last:border-b-0"
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-[var(--text)] truncate">
            {sender?.name || message.sender_phone || "—"}
          </span>
          <span className="hidden sm:inline text-[11px] text-[var(--muted)] whitespace-nowrap shrink-0">
            {formatDate(message.created_at)}
          </span>
        </span>
        <span className="block text-xs text-[var(--muted)] truncate mt-0.5">
          {truncate(message.raw_text, 90)}
        </span>
      </span>
      <StatusBadge status={messageStatus(message)} />
    </button>
  );
}

function QueueEmptyState({
  hasHistory,
  onOpenSettings,
  onOpenChats,
}: {
  hasHistory: boolean;
  onOpenSettings: () => void;
  onOpenChats: () => void;
}) {
  return (
    <div className="rounded-xl px-4 py-8 sm:px-8 sm:py-10 text-center" style={CARD_STYLE}>
      <div
        className="w-12 h-12 rounded-full mx-auto flex items-center justify-center float-soft"
        style={{ background: "var(--bg3)", border: "1px solid var(--border)" }}
      >
        <svg className="w-6 h-6" style={{ color: "var(--accent)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </div>

      <h2 className="text-base font-semibold text-[var(--text)] mt-4">
        {hasHistory ? "Всё обработано" : "Очередь пуста"}
      </h2>
      <p className="text-sm text-[var(--muted)] mt-1.5 max-w-md mx-auto leading-relaxed">
        Сюда попадают сообщения из WhatsApp, которым нужно ваше подтверждение: сервис разбирает текст, а вы проверяете результат.
      </p>

      {!hasHistory && (
        <div className="mt-6">
          <InfoSteps
            steps={[
              { title: "Сообщение из WhatsApp", text: "Приходит в чат, разрешённый для интеграции." },
              { title: "Автоматический разбор", text: "Сервис определяет материал, тип операции и количество." },
              { title: "Подтверждение", text: "Вы проверяете данные — создаётся транзакция." },
            ]}
          />
        </div>
      )}

      <div className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2">
        <button type="button" onClick={onOpenSettings} className="dp-btn-primary">
          Настройки подключения
        </button>
        <button type="button" onClick={onOpenChats} className="dp-btn-secondary">
          Разрешённые чаты
        </button>
      </div>
    </div>
  );
}

// ── Allowed chats panel ───────────────────────────────────

function ReadonlyChatsCard({ allowedChatIds }: { allowedChatIds: string[] }) {
  return (
    <div className="rounded-xl p-4 sm:p-5" style={CARD_STYLE}>
      <h3 className="text-sm font-semibold text-[var(--text)]">Разрешённые чаты</h3>
      {allowedChatIds.length === 0 ? (
        <p className="text-xs text-[var(--muted)] mt-2 leading-relaxed">
          Список пуст — обрабатываются все входящие сообщения.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {allowedChatIds.map((id) => (
            <li
              key={id}
              className="px-3 py-2 rounded-lg text-xs font-mono text-[var(--text)] truncate"
              style={{ background: "var(--bg3)", border: "1px solid var(--border)" }}
            >
              {id}
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-[var(--muted)] mt-3">
        Управлять списком может администратор компании.
      </p>
    </div>
  );
}

function ChatsPanel({
  allowedChatIds,
  isAdmin,
}: {
  allowedChatIds: string[];
  isAdmin: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl p-4 sm:p-5" style={CARD_STYLE}>
        <h2 className="text-sm font-semibold text-[var(--text)]">Зачем нужен список</h2>
        <p className="text-sm text-[var(--muted)] mt-1.5 leading-relaxed">
          В очередь попадают сообщения только из разрешённых чатов. Остальные переписки игнорируются — так в учёт не попадают личные чаты и служебные рассылки.
        </p>

        {isAdmin && (
          <div className="mt-4">
            <p className="text-xs font-medium text-[var(--muted)] mb-2">Как добавить чат</p>
            <InfoSteps
              steps={[
                { title: "Скопируйте Chat ID", text: "В «Очереди» нажмите на Chat ID под сообщением." },
                { title: "Вставьте в список", text: "Введите ID в поле ниже и нажмите «Добавить»." },
                { title: "Готово", text: "Новые сообщения из этого чата начнут попадать в очередь." },
              ]}
            />
          </div>
        )}
      </div>

      {isAdmin ? (
        <AllowedChatsCard initialChatIds={allowedChatIds} />
      ) : (
        <ReadonlyChatsCard allowedChatIds={allowedChatIds} />
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────

export default function WhatsAppList({
  messages: initialMessages,
  materials,
  channelIds = [],
  webhookId = null,
  companyId,
  allowedChatIds = [],
  isAdmin = false,
  senderMap = {},
}: {
  messages: WazzupMessage[];
  materials: WazzupMaterial[];
  channelIds?: string[];
  webhookId?: string | null;
  companyId?: string;
  allowedChatIds?: string[];
  isAdmin?: boolean;
  senderMap?: Record<string, { name: string; position: string | null }>;
}) {
  const [messages, setMessages] = useState<WazzupMessage[]>(initialMessages);
  const [activeTab, setActiveTab] = useState<QueueTab>("queue");
  const [selectedMsgId, setSelectedMsgId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectPending, startRejectTransition] = useTransition();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);

  const showToast = (text: string, ok = true) => {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 3000);
  };

  function copyChatId(chatId: string) {
    const done = () => {
      showToast("Chat ID скопирован");
    };
    if (navigator.clipboard) {
      navigator.clipboard.writeText(chatId).then(done).catch(() => { legacyCopy(chatId); done(); });
    } else { legacyCopy(chatId); done(); }
  }

  function legacyCopy(text: string) {
    const el = document.createElement("textarea");
    el.value = text; el.style.position = "fixed"; el.style.opacity = "0";
    document.body.appendChild(el); el.focus(); el.select();
    try { document.execCommand("copy"); } catch {}
    document.body.removeChild(el);
  }

  useEffect(() => {
    if (!companyId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`wazzup_messages:${companyId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "wazzup_messages", filter: `company_id=eq.${companyId}` },
        (payload) => {
          const newMsg = payload.new as WazzupMessage;
          setMessages((prev) => prev.some((m) => m.id === newMsg.id) ? prev : [newMsg, ...prev]);
        }
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "wazzup_messages", filter: `company_id=eq.${companyId}` },
        (payload) => {
          const updated = payload.new as WazzupMessage;
          setMessages((prev) => prev.map((m) => m.id === updated.id ? { ...m, ...updated } : m));
        }
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [companyId]);

  const handleReject = (id: string) => {
    setRejectingId(id);
    startRejectTransition(async () => {
      try {
        await rejectWhatsAppMessage(id);
        setMessages((prev) => prev.map((m) => m.id === id ? { ...m, needs_review: false, parsed: true } : m));
        showToast("Сообщение отклонено");
      } catch {
        showToast("Ошибка при отклонении", false);
      } finally {
        setRejectingId(null);
      }
    });
  };

  const handleConfirmSuccess = (id: string) => {
    setMessages((prev) => prev.map((m) => m.id === id ? { ...m, parsed: true, needs_review: false } : m));
    showToast("Транзакция создана");
  };

  const selectedMessage = selectedMsgId ? messages.find((m) => m.id === selectedMsgId) ?? null : null;
  const confirmingMessage = confirmingId ? messages.find((m) => m.id === confirmingId) ?? null : null;

  const queueMessages = messages.filter((m) => messageStatus(m) === "yellow");
  const processedMessages = messages.filter((m) => messageStatus(m) !== "yellow");
  const senderFor = (msg: WazzupMessage) =>
    msg.sender_phone ? senderMap[msg.sender_phone] ?? null : null;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="min-w-0">
          <h1 className="text-display text-[var(--text)]">WhatsApp</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            {queueMessages.length > 0
              ? `На проверке: ${queueMessages.length} · всего ${messages.length}`
              : messages.length > 0
                ? `Все сообщения обработаны · всего ${messages.length}`
                : "Входящие сообщения, разбор и подтверждение"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          title="Настройки подключения"
          className="dp-btn-secondary shrink-0 px-3 sm:px-4"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="hidden sm:inline">Настройки</span>
        </button>
      </div>

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Разделы WhatsApp"
        className="flex gap-1 p-1 rounded-xl mb-5"
        style={{ background: "var(--bg3)", border: "1px solid var(--border)" }}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const count = tab.id === "queue" ? queueMessages.length : allowedChatIds.length;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`whatsapp-tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`whatsapp-panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className="flex-1 min-w-0 inline-flex items-center justify-center gap-1.5 px-2 sm:px-4 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-colors"
              style={{
                background: isActive ? "var(--accent)" : "transparent",
                color: isActive ? "var(--accent-text)" : "var(--muted)",
              }}
            >
              <span className="truncate">{tab.label}</span>
              {count > 0 && (
                <span
                  className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold tabular-nums shrink-0"
                  style={
                    isActive
                      ? { background: "rgba(4,18,14,0.16)", color: "var(--accent-text)" }
                      : { background: "var(--card)", color: "var(--muted)", border: "1px solid var(--border)" }
                  }
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Queue panel — stays mounted so tab switching doesn't reset state */}
      <section
        role="tabpanel"
        id="whatsapp-panel-queue"
        aria-labelledby="whatsapp-tab-queue"
        className={activeTab === "queue" ? "" : "hidden"}
      >
        {queueMessages.length === 0 ? (
          <QueueEmptyState
            hasHistory={messages.length > 0}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenChats={() => setActiveTab("chats")}
          />
        ) : (
          <div className="space-y-3">
            {queueMessages.map((msg) => (
              <MessageCard
                key={msg.id}
                message={msg}
                sender={senderFor(msg)}
                onSelect={() => setSelectedMsgId(msg.id)}
                onConfirm={() => setConfirmingId(msg.id)}
                onCopyChatId={copyChatId}
              />
            ))}
          </div>
        )}

        {processedMessages.length > 0 && (
          <details className="mt-6 [&[open]_.chevron]:rotate-180">
            <summary className="flex items-center gap-2 px-1 py-2 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden text-sm font-medium text-[var(--muted)] hover:text-[var(--text)] transition-colors">
              <svg className="chevron w-4 h-4 transition-transform shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              Обработанные · {processedMessages.length}
            </summary>
            <div className="mt-2 rounded-xl overflow-hidden" style={CARD_STYLE}>
              {processedMessages.map((msg) => (
                <ProcessedRow
                  key={msg.id}
                  message={msg}
                  sender={senderFor(msg)}
                  onSelect={() => setSelectedMsgId(msg.id)}
                />
              ))}
            </div>
          </details>
        )}
      </section>

      {/* Allowed chats panel — also stays mounted to keep its input/list state */}
      <section
        role="tabpanel"
        id="whatsapp-panel-chats"
        aria-labelledby="whatsapp-tab-chats"
        className={activeTab === "chats" ? "" : "hidden"}
      >
        <ChatsPanel allowedChatIds={allowedChatIds} isAdmin={isAdmin} />
      </section>

      {/* Settings drawer */}
      {settingsOpen && (
        <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setSettingsOpen(false)} />
      )}
      <div
        className={`fixed right-0 top-0 h-full w-full sm:w-[380px] max-w-full z-50 flex flex-col transition-transform duration-300 ease-in-out ${
          settingsOpen ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ background: "var(--bg)", borderLeft: "1px solid var(--border)" }}
      >
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <span className="text-sm font-semibold text-[var(--text)]">Настройки WhatsApp</span>
          <button onClick={() => setSettingsOpen(false)}
            className="p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--bg3)] transition-colors shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-5 space-y-5">
          <div className="rounded-xl p-4" style={CARD_STYLE}>
            <div className="flex items-center gap-2 mb-3">
              <span className={`w-2 h-2 rounded-full shrink-0 ${channelIds.length > 0 ? "bg-[#25D366]" : "bg-[#888888]"}`} />
              <span className="text-sm font-medium text-[var(--text)]">
                {channelIds.length > 0 ? "Подключено" : "Не подключено"}
              </span>
            </div>
            {channelIds.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-[var(--muted)]">Channel ID</p>
                {channelIds.map((id) => (
                  <span key={id} className="block px-2 py-1 rounded-lg text-xs font-mono truncate"
                    style={{ background: "var(--bg3)", border: "1px solid var(--border)", color: "var(--muted)" }}>{id}</span>
                ))}
              </div>
            )}
            {webhookId && (
              <div className="mt-3">
                <p className="text-xs font-medium text-[var(--muted)] mb-1">Webhook ID</p>
                <span className="block px-2 py-1 rounded-lg text-xs font-mono truncate"
                  style={{ background: "var(--bg3)", border: "1px solid var(--border)", color: "var(--muted)" }}>{webhookId}</span>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => { setSettingsOpen(false); setActiveTab("chats"); }}
            className="dp-btn-secondary w-full"
          >
            Разрешённые чаты
          </button>

          {isAdmin && (
            <>
              <ResubscribeButton />
            </>
          )}
        </div>
      </div>

      {/* Message detail drawer */}
      {selectedMessage && (
        <MessageDetailDrawer
          message={selectedMessage}
          senderMap={senderMap}
          onClose={() => setSelectedMsgId(null)}
          onOpenConfirm={(id) => setConfirmingId(id)}
          onReject={handleReject}
          rejectPending={rejectPending}
          rejectingId={rejectingId}
        />
      )}

      {/* Confirm modal */}
      {confirmingMessage && (
        <ConfirmModal
          message={confirmingMessage}
          materials={materials}
          onClose={() => setConfirmingId(null)}
          onSuccess={handleConfirmSuccess}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg ${
          toast.ok ? "bg-[var(--accent)] text-[var(--accent-text)]" : "bg-red-500 text-white"
        }`}>
          {toast.text}
        </div>
      )}
    </div>
  );
}
