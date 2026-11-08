import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "./config";
import { logger } from "./logger";
import { assertCompanyId } from "./store";

const log = logger("media");

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/wav": "wav",
  "video/mp4": "mp4",
  "application/pdf": "pdf",
};

/**
 * Сохранить медиа на диск и вернуть URL на шлюз.
 *
 * Приложение скачивает его с заголовком Authorization: Bearer GATEWAY_TOKEN —
 * ровно так же, как раньше качало с CDN Wazzup, поэтому парсер фото и
 * транскрипция голосовых продолжают работать без изменений.
 */
export async function saveMediaBuffer(
  companyId: string,
  buffer: Buffer,
  mimetype: string,
  originalName: string | null
): Promise<{ url: string; mimetype: string; name: string }> {
  const id = assertCompanyId(companyId);
  if (buffer.length > config.mediaMaxBytes) {
    throw new Error(`медиа больше лимита (${buffer.length} > ${config.mediaMaxBytes})`);
  }

  const dir = path.join(config.paths.media, id);
  await fs.mkdir(dir, { recursive: true });

  const ext = EXT_BY_MIME[mimetype] ?? "bin";
  const filename = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ext}`;
  await fs.writeFile(path.join(dir, filename), buffer);

  return {
    url: `/media/${id}/${filename}`,
    mimetype,
    name: originalName ?? filename,
  };
}

/** Безопасно превратить запрос /media/<company>/<file> в путь на диске. */
export function resolveMediaPath(companyId: string, filename: string): string | null {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(companyId)) return null;
  if (!/^[A-Za-z0-9_.-]{1,128}$/.test(filename)) return null;
  if (filename.includes("..")) return null;

  const base = path.join(config.paths.media, companyId);
  const full = path.join(base, filename);
  // Дополнительная страховка: итоговый путь обязан лежать внутри base.
  if (!full.startsWith(base + path.sep)) return null;
  return full;
}

export function mimetypeForFile(filename: string): string {
  const ext = path.extname(filename).slice(1).toLowerCase();
  for (const [mime, known] of Object.entries(EXT_BY_MIME)) {
    if (known === ext) return mime;
  }
  return "application/octet-stream";
}

export function mediaLog() {
  return log;
}
