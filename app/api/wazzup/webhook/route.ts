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
  // ── FULL RAW BODY ──────────────────────────────────────
  console.log("[wazzup/webhook] RAW BODY:", JSON.stringify(body));

  if (!body || typeof body !== "object") {
    console.log("[wazzup/webhook] SKIP: body is null or not object");
    return;
  }
  const payload = body as Record<string, unknown>;

  console.log(`[wazzup/webhook] event="${payload.event}" data_count=${Array.isArray(payload.data) ? (payload.data as unknown[]).length : "not array"}`);

  if (payload.event !== "message.add") {
    console.log(`[wazzup/webhook] SKIP: event="${payload.event}" is not message.add`);
    return;
  }

  const data = Array.isArray(payload.data) ? payload.data : [];
  if (data.length === 0) {
    console.log("[wazzup/webhook] SKIP: data array is empty");
    return;
  }

  const service = createServiceClient();

  for (const item of data) {
    if (!item || typeof item !== "object") {
      console.log("[wazzup/webhook] SKIP item: null or not object");
      continue;
    }
    const msg = item as Record<string, unknown>;

    // ── DIRECTION FILTER ───────────────────────────────
    const dir = typeof msg.direction === "string" ? msg.direction.toLowerCase() : "";
    const messageId = typeof msg.message_id === "string" ? msg.message_id : String(msg.id ?? "");
    const channelId = typeof msg.channel_id === "string" ? msg.channel_id : String(msg.channelId ?? "");

    console.log(`[wazzup/webhook] item: message_id="${messageId}" channel_id="${channelId}" direction="${dir}" type="${msg.type}" text="${String(msg.text ?? "").slice(0, 80)}"`);

    if (dir !== "in" && dir !== "inbound" && dir !== "incoming") {
      console.log(`[wazzup/webhook] SKIP: direction="${dir}" is not incoming`);
      continue;
    }

    if (!messageId) {
      console.log("[wazzup/webhook] SKIP: empty message_id");
      continue;
    }
    if (!channelId) {
      console.log("[wazzup/webhook] SKIP: empty channel_id. Full msg keys:", Object.keys(msg).join(","));
      continue;
    }

    const rawType = typeof msg.type === "string" ? msg.type : "text";
    const text = typeof msg.text === "string" ? msg.text.trim() : "";

    const attachment =
      msg.attachment && typeof msg.attachment === "object"
        ? (msg.attachment as Record<string, unknown>)
        : null;
    const mediaUrl  = typeof attachment?.url      === "string" ? attachment.url      : null;
    const mimetype  = typeof attachment?.mimetype === "string" ? attachment.mimetype : null;
    const contentType = resolveContentType(rawType, mimetype);

    const contact = msg.contact as Record<string, unknown> | undefined;
    const sender  = msg.sender  as Record<string, unknown> | undefined;
    const chatId  = typeof msg.chatId === "string" ? msg.chatId.replace(/@.*$/, "") : "";
    const senderPhone =
      (typeof contact?.phone === "string" && contact.phone) ||
      (typeof sender?.phone  === "string" && sender.phone)  ||
      chatId || "";

    // ── IDEMPOTENCY ────────────────────────────────────
    const { data: existing } = await service
      .from("wazzup_messages")
      .select("id")
      .eq("message_id", messageId)
      .maybeSingle();

    if (existing) {
      console.log(`[wazzup/webhook] SKIP: message_id="${messageId}" already exists`);
      continue;
    }

    // ── COMPANY LOOKUP ─────────────────────────────────
    const { data: token, error: tokenErr } = await service
      .from("wazzup_tokens")
      .select("company_id")
      .contains("channel_ids", [channelId])
      .maybeSingle();

    console.log(`[wazzup/webhook] company lookup for channel_id="${channelId}": company_id=${token?.company_id ?? "NOT FOUND"} err=${tokenErr?.message ?? "none"}`);

    if (!token?.company_id) {
      console.warn(`[wazzup/webhook] SKIP: no company found for channel_id="${channelId}"`);
      continue;
    }

    // ── ALLOWED CHATS FILTER ───────────────────────────
    const { data: wazzupCfg } = await service
      .from("wazzup_config")
      .select("allowed_chat_ids")
      .eq("company_id", token.company_id)
      .maybeSingle();

    const allowedChats: string[] = wazzupCfg?.allowed_chat_ids ?? [];
    if (allowedChats.length > 0) {
      const incomingId = chatId || senderPhone;
      const isAllowed = allowedChats.some(
        (a) => incomingId && (incomingId.includes(a) || a.includes(incomingId))
      );
      if (!isAllowed) {
        console.log(`[wazzup/webhook] SKIP: chat "${incomingId}" not in allowed list ${JSON.stringify(allowedChats)}`);
        continue;
      }
      console.log(`[wazzup/webhook] chat "${incomingId}" allowed`);
    }

    // ── INSERT ─────────────────────────────────────────
    const insertPayload = {
      company_id:   token.company_id,
      message_id:   messageId,
      channel_id:   channelId,
      chat_id:      chatId || null,
      direction:    "inbound",
      sender_phone: senderPhone,
      raw_text:     text || null,
      content_type: contentType,
      media_url:    mediaUrl,
    };
    console.log("[wazzup/webhook] INSERT payload:", JSON.stringify(insertPayload));

    let savedId: string | null = null;
    try {
      const { data: saved, error: insertErr } = await service
        .from("wazzup_messages")
        .insert(insertPayload)
        .select("id")
        .single();

      if (insertErr) {
        console.error(`[wazzup/webhook] INSERT ERROR: ${insertErr.message} | code=${insertErr.code}`);
        continue;
      }
      savedId = saved?.id ?? null;
      console.log(`[wazzup/webhook] SAVED message id=${savedId}`);
    } catch (err) {
      console.error("[wazzup/webhook] INSERT EXCEPTION:", err);
      continue;
    }

    // Fire-and-forget: parse after save — never blocks or loses the message
    if (savedId) {
      void parseAndSave(savedId).catch((err) =>
        console.error(`[wazzup/webhook] parseAndSave error for id=${savedId}:`, err)
      );
    }
  }
}
