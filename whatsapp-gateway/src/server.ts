import http from "node:http";
import { promises as fs, createReadStream } from "node:fs";
import crypto from "node:crypto";
import { config } from "./config";
import { logger } from "./logger";
import { ensureDirs, cleanupMedia, assertCompanyId } from "./store";
import * as manager from "./manager";
import { resolveMediaPath, mimetypeForFile } from "./media";

const log = logger("server");

const MAX_BODY_BYTES = 64 * 1024;

function json(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

/** Сравнение токенов за постоянное время — чтобы не утекала длина префикса. */
function tokenMatches(provided: string): boolean {
  const expected = config.gatewayToken;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function authorized(req: http.IncomingMessage): boolean {
  const header = req.headers.authorization ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return false;
  return tokenMatches(match[1].trim());
}

async function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > MAX_BODY_BYTES) throw new Error("тело запроса слишком большое");
    chunks.push(buf);
  }
  if (chunks.length === 0) return {};
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object") throw new Error("ожидался JSON-объект");
  return parsed as Record<string, unknown>;
}

async function serveMedia(
  res: http.ServerResponse,
  companyId: string,
  filename: string
): Promise<void> {
  const full = resolveMediaPath(companyId, filename);
  if (!full) return json(res, 400, { error: "некорректный путь" });

  let stat;
  try {
    stat = await fs.stat(full);
  } catch {
    return json(res, 404, { error: "файл не найден" });
  }

  res.writeHead(200, {
    "Content-Type": mimetypeForFile(filename),
    "Content-Length": stat.size,
    "Cache-Control": "private, max-age=86400",
  });
  const stream = createReadStream(full);
  stream.on("error", () => res.destroy());
  stream.pipe(res);
}

async function route(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const parts = url.pathname.split("/").filter(Boolean);
  const method = req.method ?? "GET";

  // Health-check без токена: нужен балансировщику и docker healthcheck.
  if (url.pathname === "/health" && method === "GET") {
    return json(res, 200, { ok: true, sessions: manager.list().length });
  }

  if (!authorized(req)) {
    return json(res, 401, { error: "unauthorized" });
  }

  // GET /media/:companyId/:file
  if (parts[0] === "media" && parts.length === 3 && method === "GET") {
    return serveMedia(res, parts[1], parts[2]);
  }

  // GET /sessions — список всех сессий
  if (parts.length === 1 && parts[0] === "sessions" && method === "GET") {
    return json(res, 200, { sessions: manager.list() });
  }

  // POST /sessions  { companyId }
  if (parts.length === 1 && parts[0] === "sessions" && method === "POST") {
    const body = await readJsonBody(req);
    const companyId = typeof body.companyId === "string" ? body.companyId.trim() : "";
    if (!companyId) return json(res, 400, { error: "companyId обязателен" });
    assertCompanyId(companyId);
    const session = await manager.getOrCreate(companyId);
    return json(res, 200, { session: session.getMeta() });
  }

  if (parts[0] === "sessions" && parts.length >= 2) {
    const companyId = parts[1];
    try {
      assertCompanyId(companyId);
    } catch {
      return json(res, 400, { error: "некорректный companyId" });
    }

    // GET /sessions/:companyId
    if (parts.length === 2 && method === "GET") {
      const session = manager.get(companyId);
      if (!session) return json(res, 404, { error: "сессия не найдена" });
      return json(res, 200, { session: session.getMeta() });
    }

    // GET /sessions/:companyId/chats
    if (parts.length === 3 && parts[2] === "chats" && method === "GET") {
      const session = manager.get(companyId);
      if (!session) return json(res, 404, { error: "сессия не найдена" });
      const meta = session.getMeta();
      if (meta.status !== "open") {
        return json(res, 409, {
          error: "WhatsApp не подключён",
          status: meta.status,
        });
      }
      return json(res, 200, { chats: session.getChats() });
    }

    // POST /sessions/:companyId/logout
    if (parts.length === 3 && parts[2] === "logout" && method === "POST") {
      await manager.logout(companyId);
      return json(res, 200, { ok: true });
    }
  }

  return json(res, 404, { error: "not found" });
}

export async function startServer(): Promise<http.Server> {
  await ensureDirs();
  await manager.restoreAll();

  const server = http.createServer((req, res) => {
    route(req, res).catch((err) => {
      log.error(`ошибка обработки ${req.method} ${req.url}`, err);
      if (!res.headersSent) json(res, 500, { error: "internal error" });
      else res.destroy();
    });
  });

  // Медиа накапливается — чистим по расписанию, не на каждый запрос.
  const cleanupTimer = setInterval(() => {
    void cleanupMedia().catch((err) => log.warn("очистка медиа не удалась", err));
  }, 24 * 60 * 60 * 1000);
  cleanupTimer.unref();

  await new Promise<void>((resolve) => server.listen(config.port, resolve));
  log.info(`шлюз слушает порт ${config.port}. Вебхук → ${config.appUrl}${config.appWebhookPath}`);

  const shutdown = (signal: string) => {
    log.info(`получен ${signal}, останавливаемся`);
    clearInterval(cleanupTimer);
    manager.stopAll();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 8_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  return server;
}
