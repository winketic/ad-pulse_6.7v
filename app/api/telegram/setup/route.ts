import { NextRequest } from "next/server";
import { safeEqualString } from "@/lib/telegram/secret";

// Node.js runtime is required for crypto.timingSafeEqual (not available on edge).
export const runtime = "nodejs";

// Manual, operator-only endpoint: POST + custom header only (no GET, no cookies,
// so it is neither CSRF-able nor callable by accident from a browser).
// Only POST is exported: Next.js itself answers GET/PUT/DELETE with 405 without
// ever reaching Telegram (it cannot be called by <img>/<form> or a stale bookmark).
export async function POST(request: NextRequest): Promise<Response> {
  const setup = (process.env.TELEGRAM_SETUP_SECRET ?? "").trim();
  if (setup === "") {
    console.error(
      "[telegram/setup] TELEGRAM_SETUP_SECRET is not set — setup endpoint is disabled (503)"
    );
    return Response.json({ ok: false, error: "setup_disabled" }, { status: 503 });
  }

  const got = request.headers.get("x-setup-secret") ?? "";
  if (!safeEqualString(got, setup)) {
    // Same answer for a missing and a wrong header — no hints for an attacker.
    console.warn("[telegram/setup] rejected: missing or invalid X-Setup-Secret");
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return Response.json(
      { ok: false, error: "TELEGRAM_BOT_TOKEN not set" },
      { status: 500 }
    );
  }

  // The webhook origin is taken ONLY from NEXT_PUBLIC_APP_URL (same source of
  // truth as the Wazzup subscription). It must never be derived from
  // request.url: in the Node runtime Next builds it from the Host header, so a
  // spoofed Host (or a Vercel preview/deployment-protection alias) would
  // register the bot's updates — secret_token included — on a foreign or
  // unreachable origin, silently stopping all alerts.
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "")
    .replace(/\uFEFF/g, "")
    .trim()
    .replace(/\/+$/, "");

  if (appUrl === "") {
    // Explicit failure instead of guessing: no Host fallback, no hardcoded domain.
    console.error(
      "[telegram/setup] NEXT_PUBLIC_APP_URL is not set — cannot resolve the webhook URL, refusing to register (500)"
    );
    return Response.json({ ok: false, error: "app_url_not_set" }, { status: 500 });
  }

  let base: string;
  try {
    base = new URL(appUrl).origin;
  } catch {
    console.error(
      "[telegram/setup] NEXT_PUBLIC_APP_URL is not a valid absolute URL — cannot resolve the webhook URL, refusing to register (500)"
    );
    return Response.json({ ok: false, error: "app_url_invalid" }, { status: 500 });
  }

  const webhookUrl = `${base}/api/telegram/webhook`;

  const hookSecret = (process.env.TELEGRAM_WEBHOOK_SECRET ?? "").trim();
  const payload: { url: string; allowed_updates: string[]; secret_token?: string } = {
    url: webhookUrl,
    allowed_updates: ["message"],
  };
  if (hookSecret) payload.secret_token = hookSecret;

  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  } catch (e) {
    console.error("[telegram/setup] setWebhook unreachable:", e);
    return Response.json({ ok: false, error: "telegram_unreachable" }, { status: 502 });
  }

  const data = (await response.json().catch(() => null)) as
    | { ok?: boolean; description?: string }
    | null;

  if (!data || data.ok !== true) {
    const description = data?.description ?? `HTTP ${response.status}`;
    console.error("[telegram/setup] setWebhook failed:", description);
    return Response.json(
      { ok: false, error: "telegram_error", description },
      { status: 502 }
    );
  }

  // Never echo the bot token or the webhook secret.
  console.log(`[telegram/setup] webhook registered: ${webhookUrl} (secret_token_set=${Boolean(hookSecret)})`);
  return Response.json({ ok: true, url: webhookUrl, secret_token_set: Boolean(hookSecret) });
}
