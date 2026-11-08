import path from "node:path";

function required(name: string): string {
  const v = (process.env[name] ?? "").trim();
  if (!v) {
    throw new Error(
      `[config] переменная окружения ${name} обязательна, но не задана`
    );
  }
  return v;
}

function optional(name: string, fallback: string): string {
  const v = (process.env[name] ?? "").trim();
  return v || fallback;
}

function num(name: string, fallback: number): number {
  const raw = (process.env[name] ?? "").trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = (process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes";
}

const dataDir = path.resolve(optional("DATA_DIR", "./data"));

export const config = {
  port: num("PORT", 8080),
  gatewayToken: required("GATEWAY_TOKEN"),
  appUrl: optional("APP_URL", "https://pulse.altaidynamics.kz").replace(/\/+$/, ""),
  appWebhookPath: optional("APP_WEBHOOK_PATH", "/api/whatsapp/webhook"),
  appWebhookToken: required("APP_WEBHOOK_TOKEN"),
  dataDir,
  paths: {
    auth: path.join(dataDir, "auth"),        // креды Baileys по компаниям
    meta: path.join(dataDir, "meta"),        // статус сессии (json)
    chats: path.join(dataDir, "chats"),      // кэш списка чатов (json)
    media: path.join(dataDir, "media"),      // скачанные медиафайлы
  },
  logLevel: optional("LOG_LEVEL", "info"),
  mediaEnabled: bool("MEDIA_ENABLED", true),
  mediaRetentionDays: num("MEDIA_RETENTION_DAYS", 30),
  mediaMaxBytes: num("MEDIA_MAX_BYTES", 20 * 1024 * 1024),
  syncHistory: bool("SYNC_HISTORY", true),
} as const;

export function webhookUrl(): string {
  return `${config.appUrl}${config.appWebhookPath}/${config.appWebhookToken}`;
}
