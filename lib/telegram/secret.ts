import crypto from "node:crypto";

// Constant-time compare: sha256 digests normalise length, so neither the
// content nor the length of the attacker-supplied string leaks via timing.
export function safeEqualString(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a, "utf8").digest();
  const hb = crypto.createHash("sha256").update(b, "utf8").digest();
  return crypto.timingSafeEqual(ha, hb) && a.length === b.length;
}
