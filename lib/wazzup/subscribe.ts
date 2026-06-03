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

  // ── 1. Register webhook with Wazzup ───────────────────
  const subRes = await fetch(`${WAZZUP_BASE}/webhooks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      data: [
        {
          url: `${APP_URL}/api/wazzup/webhook`,
          event: "message.add",
        },
      ],
    }),
    cache: "no-store",
  });

  let webhookId: string | null = null;
  if (subRes.ok) {
    const subData = await subRes.json().catch(() => ({}));
    // Response may be { data: [{id, url, event}] } or { id: ... }
    webhookId =
      subData?.data?.[0]?.id ??
      subData?.id ??
      null;
  } else {
    const errBody = await subRes.text().catch(() => "");
    console.error(
      `[wazzup/subscribe] webhook registration failed [${subRes.status}]: ${errBody}`
    );
    // Non-fatal: continue to fetch channels
  }

  // ── 2. Fetch company's WhatsApp channels ──────────────
  const channelRes = await fetch(`${WAZZUP_BASE}/channels`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  let channelIds: string[] = [];
  if (channelRes.ok) {
    const channelData = await channelRes.json().catch(() => ({}));
    const channels: { id: string }[] =
      channelData?.data ?? channelData?.channels ?? [];
    channelIds = channels.map((c) => c.id).filter(Boolean);
  } else {
    console.error(
      `[wazzup/subscribe] channel fetch failed [${channelRes.status}]`
    );
  }

  // ── 3. Persist webhook_id + channel_ids ───────────────
  const update: Record<string, unknown> = { channel_ids: channelIds };
  if (webhookId) update.webhook_id = webhookId;

  await service
    .from("wazzup_tokens")
    .update(update)
    .eq("company_id", companyId);
}
