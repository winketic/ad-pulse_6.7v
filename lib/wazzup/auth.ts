import crypto from "crypto";
import { createServiceClient } from "@/lib/supabase/service";

const WAZZUP_BASE = "https://tech.wazzup24.com/v2/oauth";

export function getRedirectUri(requestUrl: string): string {
  const { origin } = new URL(requestUrl);
  return `${origin}/api/wazzup/callback`;
}

// ─── PKCE ─────────────────────────────────────────────────
// codeVerifier: base64url of 48 random bytes → 64 chars, alphabet [A-Za-z0-9\-_]
// satisfies PKCE spec (length 43-128, chars [A-Za-z0-9\-._~])

export function generatePKCE(): {
  codeVerifier: string;
  codeChallenge: string;
} {
  const codeVerifier = crypto
    .randomBytes(48)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  return { codeVerifier, codeChallenge };
}

// ─── Auth URL ─────────────────────────────────────────────

export function getAuthUrl(
  codeChallenge: string,
  state: string,
  redirectUri: string,
  clientId: string
): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "transport,crm",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return `${WAZZUP_BASE}/authorize?${params.toString()}`;
}

// ─── Partner credentials from DB ──────────────────────────

export async function getPartnerCredentials(
  companyId: string
): Promise<{ email: string; password: string; clientId: string }> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("wazzup_config")
    .select("partner_email, partner_password, client_id")
    .eq("company_id", companyId)
    .single();

  if (error || !data?.partner_email || !data?.partner_password) {
    throw new Error(
      "Партнёрские данные Wazzup не настроены. Укажите их в Настройках."
    );
  }

  if (!data.client_id) {
    throw new Error(
      "Client ID Wazzup не настроен. Укажите его в Настройках."
    );
  }

  const clean = (s: string) => s.replace(/\uFEFF/g, "").trim();
  return {
    email: clean(data.partner_email),
    password: clean(data.partner_password),
    clientId: clean(data.client_id),
  };
}

// ─── Token Exchange ───────────────────────────────────────

export type WazzupTokens = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  companyId: string,
  redirectUri: string
): Promise<WazzupTokens> {
  const { email, password, clientId } = await getPartnerCredentials(companyId);
  const credentials = Buffer.from(`${email}:${password}`, "utf-8").toString("base64");

  const res = await fetch(`${WAZZUP_BASE}/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      authorize_code_data: {
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        code_verifier: codeVerifier,
      },
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "(empty body)");
    throw new Error(`Wazzup token exchange failed [${res.status}]: ${body}`);
  }

  const json = await res.json();
  console.log("[exchangeCodeForTokens] raw response:", JSON.stringify(json));
  // Wazzup wraps tokens in { data: { access_token, ... }, meta: {...} }
  const tokenData = json?.data ?? json;
  return tokenData as WazzupTokens;
}
