import crypto from "crypto";

const CLIENT_ID = process.env.WAZZUP_CLIENT_ID!;
const PARTNER_EMAIL = process.env.WAZZUP_PARTNER_EMAIL!;
const PARTNER_PASSWORD = process.env.WAZZUP_PARTNER_PASSWORD!;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL!;

const WAZZUP_BASE = "https://tech.wazzup24.com/v2/oauth";

export const REDIRECT_URI = () => `${APP_URL}/api/wazzup/callback`;

// ─── PKCE ─────────────────────────────────────────────────

/**
 * Generates a PKCE code_verifier + code_challenge pair.
 *
 * code_verifier : 64 random base64url chars [A-Za-z0-9-_] (subset of [A-Za-z0-9-._~])
 * code_challenge: BASE64URL(SHA-256(code_verifier))
 */
export function generatePKCE(): {
  codeVerifier: string;
  codeChallenge: string;
} {
  // 48 bytes → 64 base64url chars (no padding since 48 % 3 === 0)
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

export function getAuthUrl(codeChallenge: string, state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI(),
    scope: "transport,crm",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return `${WAZZUP_BASE}/authorize?${params.toString()}`;
}

// ─── Token Exchange ───────────────────────────────────────

export type WazzupTokens = {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
};

export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string
): Promise<WazzupTokens> {
  if (!PARTNER_EMAIL || !PARTNER_PASSWORD) {
    throw new Error("WAZZUP_PARTNER_EMAIL / WAZZUP_PARTNER_PASSWORD not set");
  }

  const credentials = Buffer.from(
    `${PARTNER_EMAIL}:${PARTNER_PASSWORD}`
  ).toString("base64");

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
        redirect_uri: REDIRECT_URI(),
        client_id: CLIENT_ID,
        code_verifier: codeVerifier,
      },
    }),
    // Don't cache this request
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "(empty body)");
    throw new Error(`Wazzup token exchange failed [${res.status}]: ${body}`);
  }

  const data = await res.json();
  return data as WazzupTokens;
}
