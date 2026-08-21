import fs from "node:fs";
import path from "node:path";

/**
 * Minimal .env.local loader — the test harness runs outside Next.js, so the
 * usual automatic env injection isn't available. Reads the project's
 * .env.local (BOM-tolerant, mirrors lib/supabase/service.ts) and returns the
 * three keys the programmatic login needs. Does NOT mutate process.env.
 */
export function loadEnv(): {
  url: string;
  anonKey: string;
  serviceKey: string;
} {
  // Allow real env vars (CI) to win; fall back to .env.local (local dev).
  const fromProcess = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  if (fromProcess.url && fromProcess.anonKey && fromProcess.serviceKey) {
    return fromProcess as { url: string; anonKey: string; serviceKey: string };
  }

  const envPath = path.join(__dirname, "..", "..", ".env.local");
  let raw = "";
  try {
    raw = fs.readFileSync(envPath, "utf8").replace(/﻿/g, "");
  } catch {
    throw new Error(
      `Cannot read ${envPath}. Set NEXT_PUBLIC_SUPABASE_URL, ` +
        `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SERVICE_ROLE_KEY ` +
        `in the environment or in .env.local.`,
    );
  }

  const pick = (key: string): string => {
    const m = raw.match(new RegExp("^" + key + "=(.*)$", "m"));
    return (m?.[1] ?? "").trim();
  };

  const url = fromProcess.url || pick("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey =
    fromProcess.anonKey || pick("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const serviceKey =
    fromProcess.serviceKey || pick("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !anonKey || !serviceKey) {
    throw new Error(
      "Missing Supabase keys — need NEXT_PUBLIC_SUPABASE_URL, " +
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return { url, anonKey, serviceKey };
}

/** Base URL under test — never point this at production. */
export function baseURL(): string {
  return process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
}

/** Demo account used for authenticated smoke tests (read-only). */
export const DEMO_EMAIL =
  process.env.PLAYWRIGHT_DEMO_EMAIL || "director@altai-demo.kz";

/** Directory holding all generated storage states (gitignored). */
export const AUTH_DIR = path.join(__dirname, "..", ".auth");

/** Where the reusable director (smoke suite) storage state is written. */
export const STORAGE_STATE = path.join(AUTH_DIR, "director.json");

export type E2ERole = "admin" | "manager" | "warehouse" | "workshop";

/** Storage-state path for an E2E_TEST role user. */
export function roleStatePath(role: E2ERole): string {
  return path.join(AUTH_DIR, `e2e-${role}.json`);
}
