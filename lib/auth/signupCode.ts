// Код подтверждения почты при регистрации. Хранится в user_metadata
// (auth.users) в виде соли и sha256, без отдельной таблицы: миграция не нужна.

import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export const EMAIL_CODE_TTL_MIN = 15;
export const EMAIL_CODE_MAX_ATTEMPTS = 5;
export const EMAIL_CODE_RESEND_SECONDS = 60;

export function generateSignupCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function generateSignupSalt(): string {
  return randomBytes(8).toString("hex");
}

export function hashCode(code: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${code}`).digest("hex");
}

export function codeMatches(code: string, salt: string, expectedHash: string): boolean {
  if (!/^\d{6}$/.test(code) || !/^[0-9a-f]{64}$/.test(expectedHash)) return false;
  const actual = Buffer.from(hashCode(code, salt), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function codeExpiresAt(now: number = Date.now()): string {
  return new Date(now + EMAIL_CODE_TTL_MIN * 60 * 1000).toISOString();
}

export function isCodeExpired(expiresAt: string | null | undefined, now: number = Date.now()): boolean {
  if (!expiresAt) return true;
  const time = Date.parse(expiresAt);
  return !Number.isFinite(time) || time <= now;
}
