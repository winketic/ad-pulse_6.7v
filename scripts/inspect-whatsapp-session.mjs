#!/usr/bin/env node
/**
 * Полная инспекция состояния WhatsApp-шлюза после привязки номера.
 *
 * Запуск:  node scripts/inspect-whatsapp-session.mjs
 *
 * Отвечает на вопросы, которые не видно из UI:
 *   - какая сессия живёт на шлюзе и в каком она состоянии;
 *   - сколько чатов реально пришло из WhatsApp и как они называются;
 *   - правильно ли определён тип (группа / личный);
 *   - что записано в БД и какие чаты отмечены для разбора.
 *
 * Только чтение — ничего не меняет и не отправляет.
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
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[trimmed.slice(0, eq).trim()] = value;
  }
  return env;
}

const env = { ...loadEnv(), ...process.env };
const GATEWAY_URL = (env.WHATSAPP_GATEWAY_URL || "").replace(/\/+$/, "");
const TOKEN = (env.WHATSAPP_GATEWAY_TOKEN || "").trim();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!GATEWAY_URL || !TOKEN) {
  console.error("Не заданы WHATSAPP_GATEWAY_URL / WHATSAPP_GATEWAY_TOKEN в .env.local");
  process.exit(1);
}

async function gw(pathname) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${GATEWAY_URL}${pathname}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      signal: controller.signal,
    });
    const text = await res.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return { status: res.status, ok: res.ok, body };
  } finally {
    clearTimeout(timer);
  }
}

async function db(table, query) {
  if (!SUPABASE_URL || !SERVICE_KEY) return null;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  return res.ok ? res.json() : null;
}

console.log(`Шлюз: ${GATEWAY_URL}\n`);

const sessions = await gw("/sessions");
if (!sessions.ok) {
  console.error(`Шлюз ответил ${sessions.status}:`, sessions.body);
  process.exit(1);
}

const list = sessions.body?.sessions ?? [];
if (list.length === 0) {
  console.log("Сессий нет — номер ещё не привязывали (или привязка отвязана).");
  console.log("Откройте /dashboard/whatsapp/connect и нажмите «Подключить WhatsApp».");
  process.exit(0);
}

for (const item of list) {
  const detail = await gw(`/sessions/${item.companyId}`);
  const meta = detail.body?.session ?? {};
  console.log(`Сессия ${item.companyId}`);
  console.log(`  статус:   ${meta.status ?? item.status}`);
  console.log(`  номер:    ${meta.phoneNumber ? "+" + meta.phoneNumber : "—"}`);
  console.log(`  профиль:  ${meta.pushName ?? "—"}`);
  if (meta.lastError) console.log(`  ошибка:   ${meta.lastError}`);

  const chats = await gw(`/sessions/${item.companyId}/chats`);
  if (chats.status === 409) {
    console.log("  чаты:     недоступны, пока сессия не в статусе open");
    console.log("");
    continue;
  }
  if (!chats.ok) {
    console.log(`  чаты:     ошибка ${chats.status}`);
    console.log("");
    continue;
  }

  const all = chats.body?.chats ?? [];
  const groups = all.filter((c) => c.isGroup);
  const named = all.filter((c) => c.name && !/^\+\d+$/.test(c.name));
  console.log(`  чатов:    ${all.length} (групп ${groups.length}, личных ${all.length - groups.length})`);
  console.log(`  с именем: ${named.length}`);

  const watched = (await db(
    "whatsapp_chats",
    `company_id=eq.${item.companyId}&is_watched=eq.true&select=chat_jid,chat_name`
  )) ?? [];
  console.log(`  отмечено: ${watched.length}`);
  for (const w of watched.slice(0, 10)) console.log(`    · ${w.chat_name || w.chat_jid}`);

  console.log("\n  Первые 10 чатов из WhatsApp:");
  for (const c of all.slice(0, 10)) {
    const kind = c.isGroup ? "группа" : "личный";
    const when = c.lastMessageAt
      ? new Date(c.lastMessageAt).toISOString().slice(0, 16).replace("T", " ")
      : "нет сообщений";
    console.log(`    ${c.name?.slice(0, 40) ?? "?"}  [${kind}]  ${when}`);
  }

  const dbSession = (await db(
    "whatsapp_sessions",
    `company_id=eq.${item.companyId}&select=status,phone_number,last_error`
  )) ?? [];
  console.log("\n  В БД:", dbSession[0] ?? "строки нет — событие session.status не дошло");
  console.log("");
}
