import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { ensureFreshToken } from "@/lib/wazzup/refreshToken";

// Vercel Cron calls this with Authorization: Bearer <CRON_SECRET>
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();
  // Hobby plan: daily cron only — refresh tokens expiring within 23h to always stay ahead
  const refreshThresholdMs = 23 * 60 * 60 * 1000;

  const { data: tokens, error } = await service
    .from("wazzup_tokens")
    .select("company_id, expires_at")
    .lt("expires_at", new Date(Date.now() + refreshThresholdMs).toISOString());

  if (error) {
    console.error("[cron/refresh-tokens] DB error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!tokens?.length) {
    console.log("[cron/refresh-tokens] no tokens need refresh");
    return NextResponse.json({ refreshed: 0 });
  }

  const results = await Promise.allSettled(
    tokens.map(async (row) => {
      console.log(`[cron/refresh-tokens] refreshing company=${row.company_id} expires_at=${row.expires_at}`);
      await ensureFreshToken(row.company_id);
      return row.company_id;
    })
  );

  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const failed = results
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map((r) => String(r.reason));

  console.log(`[cron/refresh-tokens] done: ${succeeded} refreshed, ${failed.length} failed`);
  if (failed.length) console.error("[cron/refresh-tokens] failures:", failed);

  return NextResponse.json({ refreshed: succeeded, failed });
}
