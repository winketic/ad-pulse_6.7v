import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config";
import { logger } from "./logger";

/**
 * Дисковая очередь недоставленных вебхуков.
 *
 * Зачем: приложение на Vercel передеплоивается 2–3 минуты, шлюз делает всего
 * три попытки (1с / 5с / 15с) и теряет сообщение. Для учёта материалов это
 * означает потерянный приход или расход, который клиент заметит по остаткам.
 *
 * Поэтому неотправленное падает на диск и повторяется из фоновой задачи.
 */

const log = logger("outbox");

const OUTBOX_DIR = path.join(config.dataDir, "outbox");
const MAX_PENDING = 500;

/**
 * Счётчик внутри процесса. Имя файла = время + счётчик + случайный хвост:
 * без счётчика два сообщения, пришедшие в одну миллисекунду, сортировались
 * случайно и уходили в приложение не по порядку.
 */
let sequence = 0;

async function ensureDir(): Promise<void> {
  await fs.mkdir(OUTBOX_DIR, { recursive: true });
}

export async function persistFailed(payload: unknown): Promise<void> {
  try {
    await ensureDir();
    const name =
      `${String(Date.now()).padStart(14, "0")}-` +
      `${String(sequence++).padStart(6, "0")}-` +
      `${Math.random().toString(16).slice(2, 8)}.json`;
    await fs.writeFile(
      path.join(OUTBOX_DIR, name),
      JSON.stringify({ savedAt: new Date().toISOString(), payload }),
      "utf8"
    );

    // Защита от бесконечного роста: если приложение лежит сутками,
    // лучше потерять самое старое, чем забить диск.
    const files = await listFiles();
    if (files.length > MAX_PENDING) {
      const extra = files.length - MAX_PENDING;
      for (const file of files.slice(0, extra)) {
        await fs.rm(path.join(OUTBOX_DIR, file), { force: true });
      }
      log.warn(`очередь переполнена, удалено старых: ${extra}`);
    }
  } catch (err) {
    log.error("не удалось сохранить недоставленный вебхук", err);
  }
}

async function listFiles(): Promise<string[]> {
  try {
    const names = await fs.readdir(OUTBOX_DIR);
    // Имя начинается с timestamp — сортировка даёт хронологию.
    return names.filter((n) => n.endsWith(".json")).sort();
  } catch {
    return [];
  }
}

export async function pendingCount(): Promise<number> {
  return (await listFiles()).length;
}

type DeliverFn = (payload: never) => Promise<boolean>;

/**
 * Отправить всё, что накопилось. Останавливаемся на первой неудаче:
 * нет смысла долбить приложение, если оно ещё лежит.
 */
export async function flushOutbox(deliver: DeliverFn): Promise<{
  sent: number;
  remaining: number;
}> {
  const files = await listFiles();
  let sent = 0;

  for (const file of files) {
    const full = path.join(OUTBOX_DIR, file);
    let payload: unknown;
    try {
      const raw = await fs.readFile(full, "utf8");
      payload = JSON.parse(raw).payload;
    } catch {
      // Битый файл (оборванная запись) — удаляем, иначе он заклинит очередь.
      await fs.rm(full, { force: true });
      continue;
    }

    const ok = await deliver(payload as never);
    if (!ok) break;

    await fs.rm(full, { force: true });
    sent++;
  }

  const remaining = (await listFiles()).length;
  if (sent > 0) log.info(`доставлено из очереди: ${sent}, осталось ${remaining}`);
  return { sent, remaining };
}
