import { logger } from "./logger";
import { listMeta, loadMeta } from "./store";
import { WhatsAppSession } from "./session";

const log = logger("manager");

const sessions = new Map<string, WhatsAppSession>();

export function get(companyId: string): WhatsAppSession | undefined {
  return sessions.get(companyId);
}

/**
 * Создать сессию или вернуть существующую.
 * Не запускает второе подключение, если сессия уже живёт в памяти —
 * иначе WhatsApp отвязывает предыдущее устройство (код 440).
 */
export async function getOrCreate(companyId: string): Promise<WhatsAppSession> {
  const existing = sessions.get(companyId);
  if (existing) {
    const status = existing.getMeta().status;
    if (status !== "logged_out" && status !== "failed") return existing;

    // Мёртвую сессию нельзя показывать клиенту: он нажмёт «Подключить»,
    // получит тот же logged_out и не увидит QR. Пересоздаём с нуля.
    log.info(`сессия ${companyId} в состоянии ${status} — пересоздаём`);
    existing.stop();
    sessions.delete(companyId);
    const { clearSession } = await import("./store");
    await clearSession(companyId);
  }

  const session = new WhatsAppSession(companyId, await loadMeta(companyId));
  sessions.set(companyId, session);
  await session.init();
  return session;
}

export async function logout(companyId: string): Promise<void> {
  const session = sessions.get(companyId);
  if (session) {
    await session.logout();
    sessions.delete(companyId);
    return;
  }
  // Сессии нет в памяти — чистим файлы, чтобы клиент не видел «подключено».
  const { clearSession } = await import("./store");
  await clearSession(companyId);
}

/** Поднять все сессии, которые были подключены до рестарта контейнера. */
export async function restoreAll(): Promise<void> {
  const metas = await listMeta();
  if (metas.length === 0) {
    log.info("нет сохранённых сессий");
    return;
  }

  for (const meta of metas) {
    if (meta.status === "logged_out") {
      log.info(`пропускаем ${meta.companyId}: сессия разлогинена`);
      continue;
    }
    try {
      const session = new WhatsAppSession(meta.companyId, meta);
      sessions.set(meta.companyId, session);
      await session.init();
      log.info(`сессия ${meta.companyId} восстановлена (была: ${meta.status})`);
    } catch (err) {
      log.error(`не удалось восстановить сессию ${meta.companyId}`, err);
    }
  }
}

export function list(): Array<{ companyId: string; status: string; phoneNumber: string | null }> {
  return [...sessions.values()].map((s) => {
    const meta = s.getMeta();
    return { companyId: meta.companyId, status: meta.status, phoneNumber: meta.phoneNumber };
  });
}

export function stopAll(): void {
  for (const session of sessions.values()) session.stop();
  sessions.clear();
}
