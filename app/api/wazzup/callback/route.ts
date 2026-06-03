import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { exchangeCodeForTokens } from "@/lib/wazzup/auth";
import { subscribeToWebhooks } from "@/lib/wazzup/subscribe";

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const settingsUrl = new URL("/dashboard/settings", request.url);

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");

  // ── User denied access on Wazzup side ─────────────────
  if (oauthError) {
    settingsUrl.searchParams.set("wazzup", "error");
    settingsUrl.searchParams.set("reason", oauthError);
    return NextResponse.redirect(settingsUrl);
  }

  if (!code || !state) {
    settingsUrl.searchParams.set("wazzup", "error");
    settingsUrl.searchParams.set("reason", "missing_params");
    return NextResponse.redirect(settingsUrl);
  }

  const service = createServiceClient();

  // ── Lookup state record ────────────────────────────────
  const { data: stateRecord, error: stateErr } = await service
    .from("oauth_state")
    .select("company_id, code_verifier, created_at")
    .eq("state", state)
    .single();

  if (stateErr || !stateRecord) {
    settingsUrl.searchParams.set("wazzup", "error");
    settingsUrl.searchParams.set("reason", "invalid_state");
    return NextResponse.redirect(settingsUrl);
  }

  // ── Check state TTL ────────────────────────────────────
  const age = Date.now() - new Date(stateRecord.created_at).getTime();
  if (age > STATE_TTL_MS) {
    await service.from("oauth_state").delete().eq("state", state);
    settingsUrl.searchParams.set("wazzup", "error");
    settingsUrl.searchParams.set("reason", "expired");
    return NextResponse.redirect(settingsUrl);
  }

  // ── Exchange code for tokens ───────────────────────────
  try {
    const tokens = await exchangeCodeForTokens(
      code,
      stateRecord.code_verifier
    );

    const expiresAt = new Date(
      Date.now() + tokens.expires_in * 1000
    ).toISOString();

    // Upsert: update if already connected, insert if new
    const { error: upsertErr } = await service
      .from("wazzup_tokens")
      .upsert(
        {
          company_id: stateRecord.company_id,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: expiresAt,
        },
        { onConflict: "company_id" }
      );

    if (upsertErr) throw new Error(upsertErr.message);

    // ── Subscribe to webhooks + fetch channel IDs ────────
    await subscribeToWebhooks(
      stateRecord.company_id,
      tokens.access_token
    ).catch((err) =>
      console.error("[wazzup/callback] subscribeToWebhooks error:", err)
    );

    // ── Cleanup state record ─────────────────────────────
    await service.from("oauth_state").delete().eq("state", state);

    settingsUrl.searchParams.set("wazzup", "connected");
    return NextResponse.redirect(settingsUrl);
  } catch (err) {
    console.error("[wazzup/callback] token exchange error:", err);
    // Always cleanup state on failure
    await service.from("oauth_state").delete().eq("state", state);

    settingsUrl.searchParams.set("wazzup", "error");
    settingsUrl.searchParams.set("reason", "token_exchange");
    return NextResponse.redirect(settingsUrl);
  }
}
