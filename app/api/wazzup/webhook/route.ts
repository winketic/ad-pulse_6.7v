import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { parseAndSave } from "@/lib/wazzup/parseAndSave";

type ContentType = "text" | "voice" | "image" | "document" | "other";

function resolveContentType(
  msgType: string,
  mimetype: string | null
): ContentType {
  // Prefer mimetype from attachment if available (more reliable than type field)
  if (mimetype) {
    if (mimetype.includes("audio")) return "voice";
    if (mimetype.includes("image")) return "image";
    if (mimetype.includes("pdf") || mimetype.includes("document") || mimetype.includes("msword"))
      return "document";
  }
  switch (msgType.toLowerCase()) {
    case "text":           return "text";
    case "voice":
    case "audio":
    case "ptt":            return "voice";
    case "image":
    case "photo":
    case "sticker":        return "image";
    case "document":
    case "file":           return "document";
    default:               return msgType ? "other" : "text";
  }
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  if (body) {
    void processWebhook(body).catch((err) =>
      console.error("[wazzup/webhook] processing error:", err)
    );
  }

  return NextResponse.json({ ok: true });
}

async function processWebhook(body: unknown) {
  console.log("[wazzup/webhook] payload:", JSON.stringify(body));

  if (!body || typeof body !== "object") return;
  const payload = body as Record<string, unknown>;

  if (payload.event !== "message.add") return;

  const data = Array.isArray(payload.data) ? payload.data : [];
  const service = createServiceClient();

  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const msg = item as Record<string, unknown>;

    // Wazzup sends direction: "in" for incoming; also accept "inbound"/"incoming"
    const dir = typeof msg.direction === "string" ? msg.direction.toLowerCase() : "";
    console.log(`[wazzup/webhook] msg direction="${dir}" message_id=${msg.message_id}`);
    if (dir !== "in" && dir !== "inbound" && dir !== "incoming") continue;

    const messageId = typeof msg.message_id === "string" ? msg.message_id : "";
    const channelId = typeof msg.channel_id === "string" ? msg.channel_id : "";
    if (!messageId || !channelId) continue;

    const rawType = typeof msg.type === "string" ? msg.type : "text";
    const text = typeof msg.text === "string" ? msg.text.trim() : "";

    // Wazzup attachment structure: { url, name, mimetype, size }
    const attachment =
      msg.attachment && typeof msg.attachment === "object"
        ? (msg.attachment as Record<string, unknown>)
        : null;

    const mediaUrl =
      typeof attachment?.url === "string" ? attachment.url : null;
    const mimetype =
      typeof attachment?.mimetype === "string" ? attachment.mimetype : null;

    const contentType = resolveContentType(rawType, mimetype);

    // For incoming messages the sender phone is in chatId ("79001234567@c.us"),
    // or in contact.phone / sender.phone — try all variants
    const contact = msg.contact as Record<string, unknown> | undefined;
    const sender  = msg.sender  as Record<string, unknown> | undefined;
    const chatId  = typeof msg.chatId === "string" ? msg.chatId.replace(/@.*$/, "") : "";
    const senderPhone =
      (typeof contact?.phone === "string" && contact.phone) ||
      (typeof sender?.phone  === "string" && sender.phone)  ||
      chatId || "";

    // Idempotency
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
      console.warn(`[wazzup/webhook] no company found for channel_id=${channelId}`);
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
        raw_text: text || null,
        content_type: contentType,
        media_url: mediaUrl,
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
