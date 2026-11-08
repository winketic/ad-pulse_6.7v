/**
 * Клиент собственного шлюза WhatsApp (Baileys), который мы держим на VPS.
 * Шлюз заменяет Wazzup: QR-подключение, список чатов, приём сообщений.
 *
 * ТОЛЬКО СЕРВЕРНЫЙ КОД: читает WHATSAPP_GATEWAY_TOKEN. Не импортировать
 * в клиентские компоненты — токен должен оставаться на сервере.
 */

import { readSecret } from "@/lib/env";

const BASE_URL = readSecret("WHATSAPP_GATEWAY_URL").replace(/\/+$/, "");
const TOKEN = readSecret("WHATSAPP_GATEWAY_TOKEN");

export const GATEWAY_PROVIDER = "adpulse-gateway";

export type GatewayStatus =
  | "starting"
  | "qr"
  | "connecting"
  | "open"
  | "closed"
  | "logged_out"
  | "failed";

export interface GatewaySession {
  companyId: string;
  status: GatewayStatus;
  qr: string | null;
  phoneNumber: string | null;
  pushName: string | null;
  connectedAt: string | null;
  updatedAt: string;
  lastError: string | null;
}

export interface GatewayChat {
  jid: string;
  name: string;
  isGroup: boolean;
  phone: string | null;
  lastMessageAt: number | null;
  unreadCount: number;
}

export class GatewayError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "GatewayError";
  }
}

export function gatewayConfigured(): boolean {
  return Boolean(BASE_URL && TOKEN);
}

async function call<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs = 20_000
): Promise<T> {
  if (!gatewayConfigured()) {
    throw new GatewayError(
      "Шлюз WhatsApp не настроен: задайте WHATSAPP_GATEWAY_URL и WHATSAPP_GATEWAY_TOKEN",
      503
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new GatewayError(
        `Шлюз ответил ${res.status}: ${text.slice(0, 200)}`,
        res.status
      );
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof GatewayError) throw err;
    if ((err as Error).name === "AbortError") {
      throw new GatewayError("Шлюз не ответил вовремя", 504);
    }
    throw new GatewayError(`Шлюз недоступен: ${(err as Error).message}`, 502);
  } finally {
    clearTimeout(timer);
  }
}

/** Создать сессию или получить текущую — шлюз сам решит, нужен ли QR. */
export async function startSession(companyId: string): Promise<GatewaySession> {
  const { session } = await call<{ session: GatewaySession }>("/sessions", {
    method: "POST",
    body: JSON.stringify({ companyId }),
  });
  return session;
}

export async function getSession(companyId: string): Promise<GatewaySession | null> {
  try {
    const { session } = await call<{ session: GatewaySession }>(
      `/sessions/${encodeURIComponent(companyId)}`
    );
    return session;
  } catch (err) {
    if (err instanceof GatewayError && err.status === 404) return null;
    throw err;
  }
}

export async function listChats(companyId: string): Promise<GatewayChat[]> {
  const { chats } = await call<{ chats: GatewayChat[] }>(
    `/sessions/${encodeURIComponent(companyId)}/chats`
  );
  return chats;
}

export async function logoutSession(companyId: string): Promise<void> {
  await call(`/sessions/${encodeURIComponent(companyId)}/logout`, { method: "POST" });
}

/** Абсолютный URL медиа: шлюз отдаёт относительный путь /media/... */
export function absoluteMediaUrl(mediaUrl: string | null): string | null {
  if (!mediaUrl) return null;
  if (/^https?:\/\//i.test(mediaUrl)) return mediaUrl;
  if (!BASE_URL) return null;
  return `${BASE_URL}${mediaUrl.startsWith("/") ? "" : "/"}${mediaUrl}`;
}

/** Токен для скачивания медиа — шлюз требует тот же Bearer. */
export function gatewayMediaToken(): string {
  return TOKEN;
}
