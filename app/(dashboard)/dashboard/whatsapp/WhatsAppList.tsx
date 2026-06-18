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

const TX_TYPE_LABELS: Record<TxType, string> = {
  income:  "Приход",
  expense: "Расход",
  defect:  "Брак",
  return:  "Возврат",
};

const TX_TYPE_COLORS: Record<TxType, string> = {
  income:  "text-[#00f5c4]",
  expense: "text-orange-400",
  defect:  "text-red-400",
  return:  "text-blue-400",
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
  if (status === "green") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#00f5c4]/10 text-[#00f5c4] text-xs font-medium border border-[#00f5c4]/20">
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
      Создано
    </span>
  );
  if (status === "yellow") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-400/10 text-yellow-400 text-xs font-medium border border-yellow-400/20">
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01" />
      </svg>
      Проверка
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#888888]/10 text-[var(--muted)] text-xs font-medium border border-[#888888]/20">
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
      Не распознано
    </span>
  );
}

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

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
      <div className="rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[92dvh] flex flex-col" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
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
            <p className="text-sm text-[var(--text)] rounded-lg px-3 py-2.5 leading-relaxed"
              style={{ background: "var(--bg3)", border: "1px solid var(--border)" }}>
              {message.raw_text || "—"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
            <div>
              <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Тип операции</label>
              <select value={type} onChange={(e) => setType(e.target.value as TxType)}
                className="dp-input text-sm">
                {(Object.entries(TX_TYPE_LABELS) as [TxType, string][]).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">Материал</label>
              <select value={materialId} onChange={(e) => setMaterialId(e.target.value)}
                className="dp-input text-sm">
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
                onChange={(e) => setQuantity(e.target.value)} placeholder="0" className="dp-input text-sm" />
            </div>

            {error && (
              <p className="text-xs text-red-400 rounded-lg px-3 py-2"
                style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                {error}
              </p>
            )}

            <div className="flex gap-3 pt-1 pb-2">
              <button type="button" onClick={onClose} className="dp-btn-secondary flex-1 py-2">Отмена</button>
              <button type="submit" disabled={pending} className="dp-btn-primary flex-1 py-2">
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
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <div
        className="fixed right-0 top-0 h-full z-50 flex flex-col"
        style={{ width: 420, background: "var(--bg)", borderLeft: "1px solid var(--border)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex items-center gap-3">
            <button onClick={onClose}
              className="p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--bg3)] transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <StatusBadge status={status} />
          </div>
          <span className="text-xs text-[var(--muted)]">{formatDate(message.created_at)}</span>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

          {/* Sender */}
          <div>
            <p className="text-xs font-medium text-[var(--muted)] mb-1.5">Отправитель</p>
            {sender ? (
              <div>
                <p className="text-sm font-medium text-[var(--text)]">{sender.name}</p>
                {sender.position && <p className="text-xs text-[var(--muted)] mt-0.5">{sender.position}</p>}
                <p className="text-xs text-[var(--muted)] mt-0.5 font-mono">{message.sender_phone}</p>
              </div>
            ) : (
              <p className="text-sm text-[var(--text)] font-mono">{message.sender_phone || "—"}</p>
            )}
          </div>

          {/* Raw message */}
          <div>
            <p className="text-xs font-medium text-[var(--muted)] mb-1.5">Исходное сообщение</p>
            <div className="rounded-xl px-4 py-3" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <p className="text-sm text-[var(--text)] leading-relaxed whitespace-pre-wrap">
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
              <div className="rounded-xl px-4 py-3 space-y-2.5" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                {pr.type && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[var(--muted)]">Тип операции</span>
                    <span className={`text-xs font-semibold ${TX_TYPE_COLORS[pr.type]}`}>
                      {TX_TYPE_LABELS[pr.type]}
                    </span>
                  </div>
                )}
                {pr.material_name && (
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs text-[var(--muted)] shrink-0">Материал</span>
                    <span className="text-xs text-[var(--text)] font-medium text-right">{pr.material_name}</span>
                  </div>
                )}
                {pr.quantity != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[var(--muted)]">Количество</span>
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
                      <p className="text-xs text-[var(--muted)] mt-1 leading-relaxed">{pr.note}</p>
                    </div>
                  </>
                )}
                <div className="flex items-center justify-between pt-0.5" style={{ borderTop: "1px solid var(--border)" }}>
                  <span className="text-xs text-[var(--muted)]">Уверенность</span>
                  <span className={`text-xs font-medium ${pr.confidence === "high" ? "text-[#00f5c4]" : "text-yellow-400"}`}>
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
              className="flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-colors"
              style={{ background: "rgba(0,245,196,0.08)", border: "1px solid rgba(0,245,196,0.2)", color: "#00f5c4" }}
            >
              <span>Перейти к транзакции</span>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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

  function handleCopyChatId(e: React.MouseEvent, msgId: string, chatId: string) {
    e.stopPropagation();
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

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[var(--text)]">WhatsApp</h1>
          <p className="text-sm text-[var(--muted)] mt-0.5">Входящие сообщения и автоматически созданные транзакции</p>
        </div>
        <button
          onClick={() => setSettingsOpen(true)}
          title="Настройки подключения"
          className="p-2 rounded-lg transition-colors text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--bg3)]"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      {/* Settings drawer */}
      {settingsOpen && (
        <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setSettingsOpen(false)} />
      )}
      <div
        className={`fixed right-0 top-0 h-full z-50 flex flex-col transition-transform duration-300 ease-in-out ${
          settingsOpen ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ width: 380, background: "var(--bg)", borderLeft: "1px solid var(--border)" }}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <span className="text-sm font-semibold text-[var(--text)]">Настройки WhatsApp</span>
          <button onClick={() => setSettingsOpen(false)}
            className="p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--bg3)] transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
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
                    style={{ background: "var(--bg3)", border: "1px solid var(--border)", color: "#9ca3af" }}>{id}</span>
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
          {isAdmin && (
            <>
              <AllowedChatsCard initialChatIds={allowedChatIds} />
              <ResubscribeButton />
            </>
          )}
        </div>
      </div>

      {/* Message list */}
      {messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4"
            style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
            <svg className="w-7 h-7 text-[var(--muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <p className="text-[var(--muted)] text-sm">Сообщений пока нет</p>
          <p className="text-[var(--muted)] text-xs mt-1">Подключите WhatsApp в Настройках, чтобы начать получать сообщения</p>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--bg3)" }}>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[var(--muted)] w-36">Дата</th>
                  <th id="tour-sender-col" className="text-left px-4 py-3 text-xs font-medium text-[var(--muted)] w-36">Отправитель</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[var(--muted)] w-32">Chat ID</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[var(--muted)]">Сообщение</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[var(--muted)] w-32">Статус</th>
                  <th className="px-4 py-3 w-24" />
                </tr>
              </thead>
              <tbody>
                {messages.map((msg, i) => {
                  const status = messageStatus(msg);
                  const pr = msg.parse_result;
                  const sender = msg.sender_phone ? senderMap[msg.sender_phone] : null;
                  const isSelected = msg.id === selectedMsgId;
                  return (
                    <tr
                      key={msg.id}
                      onClick={() => setSelectedMsgId(msg.id)}
                      className="cursor-pointer transition-colors"
                      style={{
                        borderTop: i > 0 ? "1px solid var(--border)" : undefined,
                        background: isSelected ? "rgba(0,245,196,0.04)" : undefined,
                      }}
                      onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "var(--bg3)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = isSelected ? "rgba(0,245,196,0.04)" : ""; }}
                    >
                      <td className="px-4 py-3 text-[var(--muted)] text-xs whitespace-nowrap">
                        {formatDate(msg.created_at)}
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        {msg.chat_id ? (
                          <button
                            onClick={(e) => handleCopyChatId(e, msg.id, msg.chat_id!)}
                            title="Нажмите чтобы скопировать Chat ID для раздела Разрешённые чаты"
                            className="group relative flex items-center gap-1.5 text-left cursor-pointer"
                          >
                            <div>
                              {sender ? (
                                <>
                                  <span className="text-[var(--text)] font-medium group-hover:text-[#00f5c4] transition-colors">{sender.name}</span>
                                  {sender.position && <span className="block text-[var(--muted)] text-[10px]">{sender.position}</span>}
                                </>
                              ) : (
                                <span className="text-[var(--muted)] font-mono group-hover:text-[#00f5c4] transition-colors">{msg.sender_phone || "—"}</span>
                              )}
                            </div>
                            <span className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-[var(--muted)] group-hover:text-[#00f5c4]">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                              </svg>
                            </span>
                          </button>
                        ) : (
                          <span className="text-[var(--muted)]">
                            {sender ? sender.name : (msg.sender_phone || "—")}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        {msg.chat_id ? (
                          <button
                            onClick={(e) => handleCopyChatId(e, msg.id, msg.chat_id!)}
                            title="Скопировать Chat ID"
                            className="group flex items-center gap-1.5 cursor-pointer font-mono text-[var(--muted)] hover:text-[#00f5c4] transition-colors"
                          >
                            <span>
                              {msg.chat_id.length > 12 ? msg.chat_id.slice(0, 12) + "…" : msg.chat_id}
                            </span>
                            <span className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                              </svg>
                            </span>
                          </button>
                        ) : (
                          <span className="text-[var(--muted)]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-[var(--text)] text-sm">{truncate(msg.raw_text)}</p>
                        {pr && (pr.type || pr.material_name || pr.quantity != null) && (
                          <p className="text-xs text-[var(--muted)] mt-0.5">
                            {[
                              pr.type ? TX_TYPE_LABELS[pr.type] : null,
                              pr.material_name,
                              pr.quantity != null ? `${pr.quantity}${pr.unit ? " " + pr.unit : ""}` : null,
                            ].filter(Boolean).join(" · ")}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        {status === "yellow" && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setConfirmingId(msg.id); }}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                            style={{ background: "rgba(0,245,196,0.1)", color: "#00f5c4", border: "1px solid rgba(0,245,196,0.2)" }}
                          >
                            Проверить
                          </button>
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
          toast.ok ? "bg-[#00f5c4] text-[#05050a]" : "bg-red-500 text-white"
        }`}>
          {toast.text}
        </div>
      )}
    </div>
  );
}
