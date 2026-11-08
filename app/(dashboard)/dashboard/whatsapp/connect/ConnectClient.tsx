"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface GatewaySession {
  status: string;
  qr: string | null;
  phoneNumber: string | null;
  pushName: string | null;
  lastError: string | null;
}

interface ChatOption {
  jid: string;
  name: string;
  isGroup: boolean;
  phone: string | null;
  lastMessageAt: string | null;
  isWatched: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  starting: "Запускаем подключение…",
  qr: "Отсканируйте QR-код в WhatsApp",
  connecting: "Подключаемся к WhatsApp…",
  open: "WhatsApp подключён",
  closed: "Соединение потеряно — переподключаемся",
  logged_out: "Устройство отвязано",
  failed: "Не удалось подключиться",
};

function formatLastMessage(iso: string | null): string {
  if (!iso) return "нет сообщений";
  const date = new Date(iso);
  const diffMin = Math.round((Date.now() - date.getTime()) / 60000);
  if (diffMin < 1) return "только что";
  if (diffMin < 60) return `${diffMin} мин назад`;
  if (diffMin < 24 * 60) return `${Math.round(diffMin / 60)} ч назад`;
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

/**
 * Если сессия истекла, middleware редиректит на /login, а fetch молча идёт
 * за редиректом и возвращает HTML страницы входа. Без этой проверки UI
 * показывал бы «Ошибка загрузки статуса» вместо понятного сообщения.
 */
/**
 * Технические ответы шлюза превращаем в действие, которое может сделать клиент.
 * Без этого человек видит «Шлюз ответил 401: unauthorized» и не знает, что делать.
 */
function explainError(message: string): string | null {
  if (/401|unauthori[sz]ed/i.test(message)) {
    return "Токен шлюза на Vercel не совпадает с WHATSAPP_GATEWAY_TOKEN на сервере. Обновите переменную и передеплойте.";
  }
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|недоступен|не ответил|abort/i.test(message)) {
    return "Приложение не смогло связаться со шлюзом. Проверьте WHATSAPP_GATEWAY_URL — нужен полный адрес с портом, например https://162-35-31-85.sslip.io:8443";
  }
  if (/не настроен/i.test(message)) {
    return "Добавьте WHATSAPP_GATEWAY_URL и WHATSAPP_GATEWAY_TOKEN в переменные окружения Vercel и сделайте редеплой.";
  }
  return null;
}

async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, init);
  if (res.redirected && res.url.includes("/login")) {
    throw new Error("Сессия истекла — обновите страницу и войдите снова");
  }
  return res;
}

export default function ConnectClient() {
  const [configured, setConfigured] = useState(true);
  const [session, setSession] = useState<GatewaySession | null>(null);
  const [chats, setChats] = useState<ChatOption[]>([]);
  const [query, setQuery] = useState("");
  const [onlyGroups, setOnlyGroups] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [gatewayError, setGatewayError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingChats, setLoadingChats] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadSession = useCallback(async () => {
    try {
      const res = await apiFetch("/api/whatsapp/session", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка загрузки статуса");
      setConfigured(data.configured !== false);
      setSession(data.session ?? null);
      return data.session as GatewaySession | null;
    } catch (err) {
      setError((err as Error).message);
      return null;
    }
  }, []);

  const loadChats = useCallback(async () => {
    setLoadingChats(true);
    try {
      const res = await apiFetch("/api/whatsapp/chats", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка загрузки чатов");
      setChats(data.chats ?? []);
      setGatewayError(data.gatewayError ?? null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingChats(false);
    }
  }, []);

  // Опрос статуса: пока WhatsApp не подключён — каждые 3 секунды.
  useEffect(() => {
    let cancelled = false;

    async function tick() {
      const current = await loadSession();
      if (cancelled) return;
      const settled = current?.status === "open" || current?.status === "logged_out";
      if (settled) return;
      pollRef.current = setTimeout(tick, 3000);
    }

    void tick();
    return () => {
      cancelled = true;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [loadSession]);

  // Как только подключились — подтягиваем список чатов.
  useEffect(() => {
    if (session?.status === "open") void loadChats();
  }, [session?.status, loadChats]);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch("/api/whatsapp/session", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Не удалось начать подключение");
      setSession(data.session ?? null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!confirm("Отвязать номер? Сообщения из WhatsApp перестанут поступать.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch("/api/whatsapp/session", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Не удалось отвязать номер");
      }
      setSession(null);
      setChats([]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleChat(chat: ChatOption) {
    const next = !chat.isWatched;
    setChats((prev) =>
      prev.map((c) => (c.jid === chat.jid ? { ...c, isWatched: next } : c))
    );
    try {
      const res = await apiFetch("/api/whatsapp/chats", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jid: chat.jid, isWatched: next, name: chat.name }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Ошибка сохранения");
      }
    } catch (err) {
      setError((err as Error).message);
      setChats((prev) =>
        prev.map((c) => (c.jid === chat.jid ? { ...c, isWatched: chat.isWatched } : c))
      );
    }
  }

  const status = session?.status ?? null;
  const isOpen = status === "open";
  const watchedCount = chats.filter((c) => c.isWatched).length;

  // У реальной компании в WhatsApp сотни чатов: без поиска и фильтра
  // список превращается в нелистаемое полотно.
  const visibleChats = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = chats.filter((chat) => {
      if (onlyGroups && !chat.isGroup) return false;
      if (!q) return true;
      return (
        chat.name.toLowerCase().includes(q) || (chat.phone ?? "").includes(q)
      );
    });
    return matched.sort((a, b) => {
      const at = a.lastMessageAt ? Date.parse(a.lastMessageAt) : 0;
      const bt = b.lastMessageAt ? Date.parse(b.lastMessageAt) : 0;
      if (bt !== at) return bt - at;
      return a.name.localeCompare(b.name, "ru");
    });
  }, [chats, query, onlyGroups]);

  const RENDER_LIMIT = 100;
  const shownChats = showAll ? visibleChats : visibleChats.slice(0, RENDER_LIMIT);

  if (!configured) {
    return (
      <div
        className="rounded-xl p-4 text-sm"
        style={{ background: "var(--card)", border: "1px solid var(--border)" }}
      >
        Шлюз WhatsApp не настроен. Добавьте переменные <code>WHATSAPP_GATEWAY_URL</code> и{" "}
        <code>WHATSAPP_GATEWAY_TOKEN</code> в окружение приложения.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && (
        <div
          className="rounded-xl px-4 py-3 text-sm"
          style={{
            background: "rgba(255,80,80,0.1)",
            border: "1px solid rgba(255,80,80,0.3)",
            color: "#ff8f8f",
          }}
        >
          {error}
          {explainError(error) && (
            <p className="mt-1 text-xs opacity-80">{explainError(error)}</p>
          )}
        </div>
      )}

      {/* ── Карточка подключения ─────────────────────────────────────── */}
      <section
        className="rounded-xl p-5"
        style={{ background: "var(--card)", border: "1px solid var(--border)" }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">Номер WhatsApp</h2>
            <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
              {isOpen
                ? `Подключён${session?.phoneNumber ? `: +${session.phoneNumber}` : ""}`
                : "Привяжите номер, чтобы AD Pulse читал сообщения из выбранных чатов"}
            </p>
          </div>

          <div className="flex gap-2">
            {!isOpen && (
              <button
                onClick={connect}
                disabled={busy}
                className="rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
                style={{ background: "var(--accent)", color: "#04231e" }}
              >
                {busy ? "…" : status === "qr" ? "Обновить QR" : "Подключить WhatsApp"}
              </button>
            )}
            {(isOpen || status === "qr" || status === "connecting") && (
              <button
                onClick={disconnect}
                disabled={busy}
                className="rounded-lg px-4 py-2 text-sm disabled:opacity-50"
                style={{ border: "1px solid var(--border)", color: "var(--muted)" }}
              >
                Отвязать
              </button>
            )}
          </div>
        </div>

        {status && !isOpen && (
          <p className="mt-4 text-sm" style={{ color: "var(--muted)" }}>
            {STATUS_LABEL[status] ?? status}
            {session?.lastError ? ` — ${session.lastError}` : ""}
          </p>
        )}

        {session?.qr && (
          <div className="mt-5 flex flex-col items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={session.qr}
              alt="QR-код для подключения WhatsApp"
              width={280}
              height={280}
              className="rounded-xl bg-white p-3"
            />
            <ol
              className="max-w-sm space-y-1 text-sm"
              style={{ color: "var(--muted)" }}
            >
              <li>1. Откройте WhatsApp на телефоне</li>
              <li>2. Настройки → Связанные устройства → Привязка устройства</li>
              <li>3. Наведите камеру на QR-код</li>
            </ol>
            <p className="text-xs" style={{ color: "var(--faint)" }}>
              QR обновляется автоматически. Телефон продолжает работать как обычно.
            </p>
          </div>
        )}
      </section>

      {/* ── Выбор чатов ──────────────────────────────────────────────── */}
      {isOpen && (
        <section
          className="rounded-xl p-5"
          style={{ background: "var(--card)", border: "1px solid var(--border)" }}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold">Какие чаты читать</h2>
            <span className="text-sm" style={{ color: "var(--muted)" }}>
              выбрано {watchedCount} из {chats.length}
            </span>
          </div>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            Сообщения из невыбранных чатов не попадут в учёт материалов.
          </p>

          {chats.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск по названию или номеру"
                aria-label="Поиск чата"
                className="min-w-0 flex-1 rounded-lg px-3 py-2 text-sm outline-none"
                style={{
                  background: "var(--bg3)",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                }}
              />
              <label
                className="flex shrink-0 cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm"
                style={{ border: "1px solid var(--border)", color: "var(--muted)" }}
              >
                <input
                  type="checkbox"
                  checked={onlyGroups}
                  onChange={(e) => setOnlyGroups(e.target.checked)}
                  className="h-4 w-4 accent-[#00f5c4]"
                />
                только группы
              </label>
            </div>
          )}

          {chats.length > 0 && (
            <p className="mt-2 text-xs" style={{ color: "var(--faint)" }}>
              Найдено {visibleChats.length}
              {visibleChats.length !== chats.length ? ` из ${chats.length}` : ""}
            </p>
          )}

          {loadingChats && (
            <p className="mt-4 text-sm" style={{ color: "var(--muted)" }}>
              Загружаем список чатов…
            </p>
          )}

          {gatewayError && (
            <p className="mt-3 text-sm" style={{ color: "#ff8f8f" }}>
              {gatewayError} — показаны сохранённые чаты.
            </p>
          )}

          {!loadingChats && chats.length === 0 && (
            <p className="mt-4 text-sm" style={{ color: "var(--muted)" }}>
              Чатов пока нет. Напишите что-нибудь в нужную группу — она появится здесь.
            </p>
          )}

          {query && visibleChats.length === 0 && (
            <p className="mt-4 text-sm" style={{ color: "var(--muted)" }}>
              Ничего не найдено. Попробуйте другое название.
            </p>
          )}

          <ul className="mt-4 divide-y" style={{ borderColor: "var(--border)" }}>
            {shownChats.map((chat) => (
              <li
                key={chat.jid}
                className="flex items-center gap-3 py-3"
                style={{ borderColor: "var(--border)" }}
              >
                <input
                  id={`chat-${chat.jid}`}
                  type="checkbox"
                  checked={chat.isWatched}
                  onChange={() => void toggleChat(chat)}
                  className="h-4 w-4 shrink-0 cursor-pointer accent-[#00f5c4]"
                />
                <label
                  htmlFor={`chat-${chat.jid}`}
                  className="min-w-0 flex-1 cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{chat.name}</span>
                    {chat.isGroup && (
                      <span
                        className="shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase"
                        style={{ background: "var(--bg3)", color: "var(--muted)" }}
                      >
                        группа
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-xs" style={{ color: "var(--faint)" }}>
                    {chat.phone ? `+${chat.phone} · ` : ""}
                    {formatLastMessage(chat.lastMessageAt)}
                  </span>
                </label>
              </li>
            ))}
          </ul>

          {!showAll && visibleChats.length > RENDER_LIMIT && (
            <button
              onClick={() => setShowAll(true)}
              className="mt-4 w-full rounded-lg px-3 py-2 text-sm"
              style={{ border: "1px solid var(--border)", color: "var(--muted)" }}
            >
              Показать ещё {visibleChats.length - RENDER_LIMIT} из {visibleChats.length}
            </button>
          )}

          <button
            onClick={() => void loadChats()}
            disabled={loadingChats}
            className="mt-3 rounded-lg px-3 py-2 text-sm disabled:opacity-50"
            style={{ border: "1px solid var(--border)", color: "var(--muted)" }}
          >
            Обновить список
          </button>
        </section>
      )}
    </div>
  );
}
