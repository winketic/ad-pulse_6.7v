import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { ensureFreshToken } from "@/lib/wazzup/refreshToken";
import { subscribeToWebhooks } from "@/lib/wazzup/subscribe";

// Vercel Cron calls GET with Authorization: Bearer <CRON_SECRET>
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[cron/refresh-wazzup-token] CRON_SECRET not configured");
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();

  // Find all companies with tokens expiring within 4 hours
  const threshold4h = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
  const { data: rows, error: dbErr } = await service
    .from("wazzup_tokens")
    .select("company_id, expires_at")
    .lt("expires_at", threshold4h);

  if (dbErr) {
    console.error("[cron/refresh-wazzup-token] DB error:", dbErr.message);
    return NextResponse.json({ error: dbErr.message }, { status: 500 });
  }

  if (!rows?.length) {
    console.log("[cron/refresh-wazzup-token] no tokens need refresh");
    return NextResponse.json({ refreshed: 0, subscribed: 0 });
  }

  console.log(`[cron/refresh-wazzup-token] refreshing ${rows.length} token(s)`);

  let refreshed = 0;
  let subscribed = 0;
  const failures: string[] = [];

  for (const row of rows) {
    try {
      console.log(`[cron/refresh-wazzup-token] company=${row.company_id} expires_at=${row.expires_at}`);

      // 1. Refresh token (if it was already refreshed by ensureFreshToken,
      //    it returns the cached fresh token without calling Wazzup again)
      const accessToken = await ensureFreshToken(row.company_id);
      refreshed++;

      // 2. Explicitly re-subscribe to webhooks with the fresh token.
      // Per Wazzup docs: must re-subscribe after each token refresh.
      // We await here (unlike the fire-and-forget in ensureFreshToken)
      // because in a cron we can afford to wait and need confirmation.
      await subscribeToWebhooks(row.company_id, accessToken);
      subscribed++;

      console.log(`[cron/refresh-wazzup-token] OK company=${row.company_id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[cron/refresh-wazzup-token] FAIL company=${row.company_id}: ${msg}`);
      failures.push(`${row.company_id}: ${msg}`);
    }
  }

  console.log(
    `[cron/refresh-wazzup-token] done: refreshed=${refreshed} subscribed=${subscribed} failed=${failures.length}`
  );

  return NextResponse.json({ refreshed, subscribed, failed: failures.length, failures });
}
