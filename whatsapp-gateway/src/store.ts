import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config";
import { logger } from "./logger";
import type { ChatInfo, SessionMeta } from "./types";

const log = logger("store");

const SAFE_COMPANY = /^[A-Za-z0-9_-]{1,64}$/;

/** company_id попадает в путь на диске — не доверяем ему напрямую. */
export function assertCompanyId(companyId: string): string {
  if (!SAFE_COMPANY.test(companyId)) {
    throw new Error(`некорректный company_id: ${JSON.stringify(companyId)}`);
  }
  return companyId;
}

export async function ensureDirs(): Promise<void> {
  for (const dir of Object.values(config.paths)) {
    await fs.mkdir(dir, { recursive: true });
  }
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    log.warn(`не удалось прочитать ${file}`, err);
    return null;
  }
}

/** Атомарная запись: сначала temp-файл, потом rename — чтобы не получить обрезанный JSON. */
async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(tmp, file);
}

function metaFile(companyId: string): string {
  return path.join(config.paths.meta, `${assertCompanyId(companyId)}.json`);
}

function chatsFile(companyId: string): string {
  return path.join(config.paths.chats, `${assertCompanyId(companyId)}.json`);
}

export function authDir(companyId: string): string {
  return path.join(config.paths.auth, assertCompanyId(companyId));
}

export async function saveMeta(meta: SessionMeta): Promise<void> {
  await writeJson(metaFile(meta.companyId), meta);
}

export async function loadMeta(companyId: string): Promise<SessionMeta | null> {
  return readJson<SessionMeta>(metaFile(companyId));
}

export async function listMeta(): Promise<SessionMeta[]> {
  let files: string[];
  try {
    files = await fs.readdir(config.paths.meta);
  } catch {
    return [];
  }
  const metas: SessionMeta[] = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    const meta = await readJson<SessionMeta>(path.join(config.paths.meta, f));
    if (meta?.companyId) metas.push(meta);
  }
  return metas;
}

export async function clearSession(companyId: string): Promise<void> {
  const id = assertCompanyId(companyId);
  await fs.rm(authDir(id), { recursive: true, force: true });
  await fs.rm(metaFile(id), { recursive: true, force: true });
  await fs.rm(chatsFile(id), { recursive: true, force: true });
}

export async function loadChats(companyId: string): Promise<ChatInfo[]> {
  return (await readJson<ChatInfo[]>(chatsFile(companyId))) ?? [];
}

export async function saveChats(companyId: string, chats: ChatInfo[]): Promise<void> {
  await writeJson(chatsFile(companyId), chats);
}

/**
 * Слить новые/обновлённые чаты с тем, что уже знаем.
 * Уже сохранённое название не затирается пустым значением — WhatsApp
 * иногда присылает чат без имени, и тогда в списке клиента появлялся бы «+7…».
 */
export function mergeChats(existing: ChatInfo[], incoming: ChatInfo[]): ChatInfo[] {
  const byJid = new Map<string, ChatInfo>();
  for (const chat of existing) byJid.set(chat.jid, chat);
  for (const chat of incoming) {
    const prev = byJid.get(chat.jid);
    if (!prev) {
      byJid.set(chat.jid, chat);
      continue;
    }
    byJid.set(chat.jid, {
      ...prev,
      ...chat,
      name: chat.name?.trim() ? chat.name : prev.name,
      phone: chat.phone ?? prev.phone,
      lastMessageAt: Math.max(prev.lastMessageAt ?? 0, chat.lastMessageAt ?? 0) || null,
      unreadCount: chat.unreadCount ?? prev.unreadCount,
    });
  }
  return [...byJid.values()].sort(
    (a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0)
  );
}

/** Удалить медиа старше MEDIA_RETENTION_DAYS. Вызывается раз в сутки. */
export async function cleanupMedia(): Promise<void> {
  if (config.mediaRetentionDays <= 0) return;
  const cutoff = Date.now() - config.mediaRetentionDays * 24 * 60 * 60 * 1000;
  let removed = 0;

  async function walk(dir: string): Promise<void> {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      try {
        const stat = await fs.stat(full);
        if (stat.mtimeMs < cutoff) {
          await fs.rm(full, { force: true });
          removed++;
        }
      } catch {
        /* файл уже удалён — не мешает */
      }
    }
  }

  await walk(config.paths.media);
  if (removed > 0) log.info(`очистка медиа: удалено ${removed} файлов`);
}
