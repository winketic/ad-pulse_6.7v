import { createServiceClient } from "@/lib/supabase/service";
import { getPartnerCredentials } from "./auth";

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

  const tokens = (await res.json()) as WazzupTokens;
  const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  await service
    .from("wazzup_tokens")
    .update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: newExpiresAt,
    })
    .eq("company_id", companyId);

  return tokens.access_token;
}
