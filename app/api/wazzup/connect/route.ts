import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { generatePKCE, getAuthUrl, getRedirectUri } from "@/lib/wazzup/auth";

export async function GET(request: NextRequest) {
  const settingsUrl = new URL("/dashboard/settings", request.url);

  // ── Authenticate user ──────────────────────────────────
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // ── Get company_id ─────────────────────────────────────
  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", user.id)
    .single();

  if (!profile?.company_id) {
    settingsUrl.searchParams.set("wazzup", "error");
    settingsUrl.searchParams.set("reason", "no_company");
    return NextResponse.redirect(settingsUrl);
  }

  // ── Generate PKCE + state ──────────────────────────────
  const { codeVerifier, codeChallenge } = generatePKCE();
  const state = crypto.randomBytes(16).toString("hex");

  // Derive redirect URI from the actual request origin (works on any env)
  const redirectUri = getRedirectUri(request.url);

  // ── Read client_id from wazzup_config ─────────────────
  const service = createServiceClient();

  const { data: wazzupCfg } = await service
    .from("wazzup_config")
    .select("client_id")
    .eq("company_id", profile.company_id)
    .maybeSingle();

  const clientId = wazzupCfg?.client_id?.replace(/\uFEFF/g, "").trim();
  if (!clientId) {
    settingsUrl.searchParams.set("wazzup", "error");
    settingsUrl.searchParams.set("reason", "no_client_id");
    return NextResponse.redirect(settingsUrl);
  }

  // ── Persist state for callback lookup ─────────────────
  await service
    .from("oauth_state")
    .delete()
    .eq("company_id", profile.company_id);

  const { error: stateErr } = await service.from("oauth_state").insert({
    company_id: profile.company_id,
    state,
    code_verifier: codeVerifier,
  });

  if (stateErr) {
    console.error("[wazzup/connect] oauth_state insert error:", stateErr);
    settingsUrl.searchParams.set("wazzup", "error");
    settingsUrl.searchParams.set("reason", "state_save");
    return NextResponse.redirect(settingsUrl);
  }

  // ── Redirect to Wazzup ─────────────────────────────────
  const authUrl = getAuthUrl(codeChallenge, state, redirectUri, clientId);
  return NextResponse.redirect(authUrl);
}
