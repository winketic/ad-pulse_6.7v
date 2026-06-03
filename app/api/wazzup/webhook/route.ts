import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { parseAndSave } from "@/lib/wazzup/parseAndSave";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  // Respond 200 immediately; process in background
  if (body) {
    void processWebhook(body).catch((err) =>
      console.error("[wazzup/webhook] processing error:", err)
    );
  }

  return NextResponse.json({ ok: true });
}

async function processWebhook(body: unknown) {
  if (!body || typeof body !== "object") return;
  const payload = body as Record<string, unknown>;

  if (payload.event !== "message.add") return;

  const data = Array.isArray(payload.data) ? payload.data : [];
  const service = createServiceClient();

  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const msg = item as Record<string, unknown>;

    if (msg.direction !== "inbound") continue;

    const messageId = typeof msg.message_id === "string" ? msg.message_id : "";
    const channelId = typeof msg.channel_id === "string" ? msg.channel_id : "";
    if (!messageId || !channelId) continue;

    const text = typeof msg.text === "string" ? msg.text : "";
    const recipient = msg.recipient as Record<string, unknown> | undefined;
    const senderPhone =
      typeof recipient?.phone === "string" ? recipient.phone : "";

    // Idempotency: skip if already stored
    const { data: existing } = await service
      .from("wazzup_messages")
      .select("id")
      .eq("message_id", messageId)
      .maybeSingle();

    if (existing) continue;

    // Resolve company by channel_id
    const { data: token } = await service
      .from("wazzup_tokens")
      .select("company_id")
      .contains("channel_ids", [channelId])
      .maybeSingle();

    if (!token?.company_id) {
      console.warn(
        `[wazzup/webhook] no company found for channel_id=${channelId}`
      );
      continue;
    }

    // Persist raw message
    const { data: saved, error: insertErr } = await service
      .from("wazzup_messages")
      .insert({
        company_id: token.company_id,
        message_id: messageId,
        channel_id: channelId,
        direction: "inbound",
        sender_phone: senderPhone,
        raw_text: text,
      })
      .select("id")
      .single();

    if (insertErr) {
      console.error("[wazzup/webhook] insert error:", insertErr.message);
      continue;
    }

    if (saved?.id) {
      await parseAndSave(saved.id);
    }
  }
}
