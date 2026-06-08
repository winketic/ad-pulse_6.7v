import { createServiceClient } from "@/lib/supabase/service";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL!;
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

  const webhookUrl = `${APP_URL}/api/wazzup/webhook`;
  console.log(`[wazzup/subscribe] company=${companyId} webhookUrl=${webhookUrl}`);

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
    const subData = JSON.parse(subBody || "{}");
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
    const channelData = JSON.parse(channelBody || "{}");
    const channels: { id: string; transport?: string; name?: string }[] =
      channelData?.data ?? channelData?.channels ?? [];
    channelIds = channels.map((c) => c.id).filter(Boolean);
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
