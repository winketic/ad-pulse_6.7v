import { createServiceClient } from "@/lib/supabase/service";

const WAZZUP_BASE = "https://tech.wazzup24.com/v2";

/**
 * Subscribes the company to Wazzup message.add webhooks and stores channel_ids.
 * Called once after a successful OAuth callback.
 */
export async function subscribeToWebhooks(
  companyId: string,
  accessToken: string
): Promise<void> {
  const service = createServiceClient();

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\uFEFF/g, "").replace(/\/$/, "").trim();
  const webhookToken = (process.env.WAZZUP_WEBHOOK_TOKEN ?? "").trim();
  const webhookUrl = `${appUrl}/api/wazzup/webhook/${webhookToken}`;

  console.log("[wazzup/subscribe] registering webhook URL:", webhookUrl);
  if (!appUrl) {
    console.error("[wazzup/subscribe] ERROR: NEXT_PUBLIC_APP_URL is not set!");
  }
  if (!webhookToken) {
    console.error("[wazzup/subscribe] ERROR: WAZZUP_WEBHOOK_TOKEN is not set \u2014 webhook will reject all requests!");
  }
  if (appUrl.includes("vercel.app")) {
    console.warn("[wazzup/subscribe] WARNING: NEXT_PUBLIC_APP_URL still points to vercel.app \u2014 should be the custom domain");
  }

  // ── 1. Register webhook with Wazzup ───────────────────
  const subRes = await fetch(`${WAZZUP_BASE}/webhooks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      data: [{ url: webhookUrl, event: "message.add" }],
    }),
    cache: "no-store",
  });

  const subBody = await subRes.text().catch(() => "");
  console.log(`[wazzup/subscribe] webhook reg [${subRes.status}]: ${subBody}`);

  let webhookId: string | null = null;
  if (subRes.ok) {
    const subData = JSON.parse(subBody || "{}") as { data?: { id?: string }[]; id?: string };
    webhookId = subData?.data?.[0]?.id ?? subData?.id ?? null;
  }

  // ── 2. Fetch company's WhatsApp channels ──────────────
  const channelRes = await fetch(`${WAZZUP_BASE}/channels`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  const channelBody = await channelRes.text().catch(() => "");
  console.log(`[wazzup/subscribe] channels [${channelRes.status}]: ${channelBody}`);

  let channelIds: string[] = [];
  if (channelRes.ok) {
    const channelData = JSON.parse(channelBody || "{}") as { data?: { channel_id?: string }[] };
    channelIds = (channelData?.data ?? []).map((ch) => ch.channel_id ?? "").filter(Boolean);
    console.log(`[wazzup/subscribe] parsed channel_ids:`, channelIds);
  }

  // ── 3. Persist webhook_id + channel_ids ───────────────
  const update: Record<string, unknown> = { channel_ids: channelIds };
  if (webhookId) update.webhook_id = webhookId;

  const { error: updateErr } = await service
    .from("wazzup_tokens")
    .update(update)
    .eq("company_id", companyId);

  if (updateErr) {
    console.error("[wazzup/subscribe] DB update error:", updateErr);
  } else {
    console.log(`[wazzup/subscribe] saved webhook_id=${webhookId} channel_ids=${JSON.stringify(channelIds)}`);
  }
}
