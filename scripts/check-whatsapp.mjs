#!/usr/bin/env node
/**
 * Проверка готовности собственного WhatsApp-шлюза.
 *
 * Запуск:  node scripts/check-whatsapp.mjs
 * Читает .env.local (если есть) и проверяет четыре звена цепочки:
 *   1. шлюз на VPS отвечает
 *   2. токен шлюза рабочий
 *   3. вебхук в проде существует и не редиректится (значит приложение задеплоено)
 *   4. в Supabase применена миграция 054 (таблицы whatsapp_sessions / whatsapp_chats)
 *
 * Ничего не меняет — только читает.
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

function loadEnv() {
  const file = path.join(ROOT, ".env.local");
  if (!fs.existsSync(file)) return {};
  const env = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const env = { ...loadEnv(), ...process.env };
// По умолчанию проверяем ПРОД: NEXT_PUBLIC_APP_URL в .env.local обычно указывает
// на localhost, а смысл проверки — увидеть, доехал ли деплой до пользователей.
const APP_URL = (
  env.WHATSAPP_CHECK_APP_URL ||
  "https://pulse.altaidynamics.kz"
).replace(/\/+$/, "");
const GATEWAY_URL = (env.WHATSAPP_GATEWAY_URL || "").replace(/\/+$/, "");
const GATEWAY_TOKEN = env.WHATSAPP_GATEWAY_TOKEN || "";
const WEBHOOK_TOKEN = env.WHATSAPP_WEBHOOK_TOKEN || "";
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || "";

const results = [];
const record = (name, status, detail) => {
  results.push({ name, status, detail });
  const icon = status === "ok" ? "✓" : status === "warn" ? "!" : "✗";
  console.log(`${icon} ${name}${detail ? ` — ${detail}` : ""}`);
};

async function timedFetch(url, init = {}, ms = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function checkGateway() {
  if (!GATEWAY_URL) {
    record("Шлюз: адрес", "fail", "WHATSAPP_GATEWAY_URL не задан");
    return;
  }
  try {
    const res = await timedFetch(`${GATEWAY_URL}/health`);
    if (!res.ok) return record("Шлюз: /health", "fail", `HTTP ${res.status}`);
    const body = await res.json();
    record("Шлюз: /health", "ok", `сессий: ${body.sessions ?? 0}`);
  } catch (err) {
    record("Шлюз: /health", "fail", err.message);
    return;
  }

  try {
    const res = await timedFetch(`${GATEWAY_URL}/sessions`, {
      headers: { Authorization: `Bearer ${GATEWAY_TOKEN}` },
    });
    if (res.status === 401) {
      record("Шлюз: токен", "fail", "GATEWAY_TOKEN отклонён — проверьте .env на сервере");
    } else if (res.ok) {
      const body = await res.json();
      record("Шлюз: токен", "ok", `сессий: ${(body.sessions ?? []).length}`);
    } else {
      record("Шлюз: токен", "warn", `HTTP ${res.status}`);
    }
  } catch (err) {
    record("Шлюз: токен", "fail", err.message);
  }
}

async function checkWebhookDeployed() {
  if (!WEBHOOK_TOKEN) {
    record("Онлайн записи в транзакции", "warn", "WHATSAPP_WEBHOOK_TOKEN не задан");
    return;
  }
  const url = `${APP_URL}/api/whatsapp/webhook/${WEBHOOK_TOKEN}`;
  try {
    const res = await timedFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "ping", data: [] }),
      redirect: "manual",
    });
    if (res.status === 401) {
      record("Приложение: вебхук", "fail", "HTTP 401 — WHATSAPP_WEBHOOK_TOKEN не совпадает с сервером");
    } else if (res.status >= 300 && res.status < 400) {
      record(
        "Приложение: вебхук",
        "fail",
        `HTTP ${res.status} — редирект на ${res.headers.get("location") ?? "?"}. Приложение не задеплоено либо путь не в PUBLIC_PATHS`
      );
    } else if (res.ok) {
      record("Приложение: вебхук", "ok", "задеплоен и принимает сообщения");
    } else {
      record("Приложение: вебхук", "warn", `HTTP ${res.status}`);
    }
  } catch (err) {
    record("Приложение: вебхук", "fail", err.message);
  }
}

async function checkTables() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    record("База: миграция 054", "warn", "нет SUPABASE_URL / SERVICE_ROLE_KEY");
    return;
  }
  const headers = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
  };
  for (const table of ["whatsapp_sessions", "whatsapp_chats"]) {
    try {
      const res = await timedFetch(
        `${SUPABASE_URL}/rest/v1/${table}?select=id&limit=1`,
        { headers }
      );
      if (res.ok) {
        record(`База: таблица ${table}`, "ok");
      } else if (res.status === 404 || res.status === 400) {
        record(`База: таблица ${table}`, "fail", "не существует — примените миграцию 054");
      } else {
        record(`База: таблица ${table}`, "warn", `HTTP ${res.status}`);
      }
    } catch (err) {
      record(`База: таблица ${table}`, "fail", err.message);
    }
  }

  try {
    const res = await timedFetch(
      `${SUPABASE_URL}/rest/v1/whatsapp_messages?select=provider&limit=1`,
      { headers }
    );
    if (res.ok) record("База: whatsapp_messages.provider", "ok");
    else record("База: whatsapp_messages.provider", "fail", "колонка не создана — миграция 054");
  } catch (err) {
    record("База: whatsapp_messages.provider", "fail", err.message);
  }
}

console.log(`Проверка WhatsApp-шлюза\n  приложение: ${APP_URL}\n  шлюз:       ${GATEWAY_URL || "(не задан)"}\n`);

await checkGateway();
await checkWebhookDeployed();
await checkTables();

const failed = results.filter((r) => r.status === "fail").length;
const warned = results.filter((r) => r.status === "warn").length;
console.log(
  `\nИтого: ${results.length - failed - warned} ok, ${warned} предупреждений, ${failed} ошибок`
);
process.exit(failed > 0 ? 1 : 0);
