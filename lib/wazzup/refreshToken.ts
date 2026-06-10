import { createServiceClient } from "@/lib/supabase/service";
import { getPartnerCredentials } from "./auth";
import { subscribeToWebhooks } from "./subscribe";

const WAZZUP_BASE = "https://tech.wazzup24.com/v2/oauth";
const REFRESH_THRESHOLD_MS = 5 * 60 * 1000;

type WazzupTokens = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

export async function ensureFreshToken(companyId: string): Promise<string> {
  const service = createServiceClient();

  const { data: rec, error } = await service
    .from("wazzup_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("company_id", companyId)
    .single();

  if (error || !rec) {
    throw new Error("WhatsApp не подключён. Подключите его в Настройках.");
  }

  const expiresAt = new Date(rec.expires_at).getTime();
  if (expiresAt >= Date.now() + REFRESH_THRESHOLD_MS) {
    return rec.access_token;
  }

  const { email, password } = await getPartnerCredentials(companyId);
  const credentials = Buffer.from(`${email}:${password}`, "utf-8").toString("base64");

  const res = await fetch(`${WAZZUP_BASE}/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: rec.refresh_token,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "(empty body)");
    throw new Error(`Wazzup token refresh failed [${res.status}]: ${body}`);
  }

  const json = await res.json();
  // Wazzup wraps response in { data: {...}, meta: {...} }
  const tokens = (json?.data ?? json) as WazzupTokens;
  const expiresIn = typeof tokens.expires_in === "number" && isFinite(tokens.expires_in)
    ? tokens.expires_in : 3600;
  const newExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  console.log(`[refreshToken] company=${companyId} new expires_at=${newExpiresAt}`);

  await service
    .from("wazzup_tokens")
    .update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: newExpiresAt,
    })
    .eq("company_id", companyId);

  // Re-register webhook after token refresh — Wazzup may expire the old subscription
  void subscribeToWebhooks(companyId, tokens.access_token).catch((err) =>
    console.warn("[refreshToken] webhook re-subscribe failed (non-fatal):", err)
  );

  return tokens.access_token;
}
