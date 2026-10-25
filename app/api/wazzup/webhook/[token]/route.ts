import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { parseAndSave } from "@/lib/wazzup/parseAndSave";

// Prevent Vercel from silently killing the function mid-query
export const maxDuration = 30;

type ContentType = "text" | "voice" | "image" | "document" | "other";

// ─── Rate limiting ────────────────────────────────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 200;     // requests per window
const RATE_WINDOW = 60_000; // 1 minute

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  // ── Token verification ─────────────────────────────────
  // Next 15 passes route params as a promise; awaiting keeps the token check
  // working instead of comparing against undefined.
  const { token } = await params;
  const expectedToken = (process.env.WAZZUP_WEBHOOK_TOKEN ?? "").trim();
  if (!expectedToken || token !== expectedToken) {
    console.warn(`[wazzup/webhook] rejected: invalid token`);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit by IP
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  if (!checkRateLimit(ip)) {
    console.warn(`[wazzup/webhook] rate limit exceeded for ip=${ip}`);
    return NextResponse.json({ ok: true }); // return 200 to avoid Wazzup retry storms
  }

  const rawBody = await request.text();

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    body = null;
  }

  // Return 200 OK immediately so Wazzup doesn't timeout and retry.
  // processWebhook runs in the background within Vercel's maxDuration window.
  if (body) {
    void processWebhook(body).catch(() =>
      console.error("[wazzup/webhook] processing failed")
    );
  }

  return NextResponse.json({ ok: true });
}

async function processWebhook(body: unknown) {

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

  // Parallel processing: total time = slowest item, not sum of all items
  await Promise.all(
    data.map((item) =>
      processItem(item).catch(() => {
        console.error("[wazzup/webhook] item processing failed");
      })
    )
  );
}

// Явный таймаут на Supabase запросы — обнаруживает зависшие соединения
async function supabaseWithTimeout<T>(
  query: PromiseLike<T>,
  ms = 5000,
  label = "query"
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`TIMEOUT ${ms}ms: ${label}`)), ms)
  );
  return Promise.race([Promise.resolve(query), timeoutPromise]);
}

async function processItem(item: unknown) {
  if (!item || typeof item !== "object") {
    console.log("[wazzup/webhook] SKIP item: null or not object");
    return;
  }
  const msg = item as Record<string, unknown>;

  // ── SERVICE CLIENT INIT ───────────────────────────
  let service: ReturnType<typeof createServiceClient>;
  try {
    // Log cleaned values (same as createServiceClient uses internally)
    const cleanVal = (s: string) => s.replace(/﻿/g, "").trim();
    const url = cleanVal(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    const key = cleanVal(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "");

    const keyOk = key.startsWith("eyJhbGci") && key.length > 100;
    const urlOk = url.startsWith("https://") && url.includes("supabase");

    console.log(`[webhook] Supabase configuration valid=${keyOk && urlOk}`);

    if (!keyOk) {
      console.error("[webhook] service role key configuration is invalid");
    }
    if (!urlOk) {
      console.error("[webhook] Supabase URL configuration is invalid");
    }

    service = createServiceClient();
  } catch {
    console.error("[webhook] Supabase admin client initialization failed");
    return;
  }


  // ── FIELD EXTRACTION ──────────────────────────────
  const dir = typeof msg.direction === "string" ? msg.direction.toLowerCase() : "";

  // Wazzup may send numeric IDs — coerce to string in all cases
  const messageId =
    (typeof msg.message_id === "string" && msg.message_id) ||
    (msg.message_id != null             ? String(msg.message_id) : "") ||
    (typeof msg.id         === "string" && msg.id)         ||
    (msg.id         != null             ? String(msg.id) : "");

  const channelId =
    (typeof msg.channel_id === "string" && msg.channel_id) ||
    (msg.channel_id != null             ? String(msg.channel_id) : "") ||
    (typeof msg.channelId  === "string" && msg.channelId)  ||
    "";

  // chat_id: Wazzup sends msg.chat_id — handle both string and number
  const chatId =
    (typeof msg.chat_id === "string" && msg.chat_id)           ||
    (typeof msg.chat_id === "number" && String(msg.chat_id))   ||
    (typeof msg.chatId  === "string" && msg.chatId.replace(/@.*$/, "")) ||
    "";


  const rawType = typeof msg.type === "string" ? msg.type : "text";
  const text    = typeof msg.text === "string" ? msg.text.trim() : "";

  const contact = msg.contact as Record<string, unknown> | undefined;
  const sender  = msg.sender  as Record<string, unknown> | undefined;
  // Per Wazzup docs: sender.phone = phone number, sender.chat_id = WhatsApp ID (handle number too)
  const senderPhone =
    (typeof sender?.phone   === "string" && sender.phone)               ||
    (typeof sender?.chat_id === "string" && sender.chat_id)             ||
    (typeof sender?.chat_id === "number" && String(sender.chat_id))     ||
    (typeof contact?.phone  === "string" && contact.phone)              ||
    chatId || "";

  const attachment = msg.attachment && typeof msg.attachment === "object"
    ? (msg.attachment as Record<string, unknown>)
    : null;
  const mediaUrl  = typeof attachment?.url      === "string" ? attachment.url      : null;
  const mimetype  = typeof attachment?.mimetype === "string" ? attachment.mimetype : null;
  const contentType = resolveContentType(rawType, mimetype);

  console.log("[wazzup/webhook] step: starting processing");

  // ── DIRECTION FILTER ───────────────────────────────
  if (dir !== "in" && dir !== "inbound" && dir !== "incoming") {
    console.log(`[wazzup/webhook] SKIP: direction="${dir}"`);
    return;
  }

  if (!messageId) {
    console.log("[wazzup/webhook] SKIP: empty message_id. Keys:", Object.keys(msg).join(","));
    return;
  }
  if (!channelId) {
    console.log("[wazzup/webhook] SKIP: empty channel_id. Keys:", Object.keys(msg).join(","));
    return;
  }
  console.log("[wazzup/webhook] step: passed direction+id checks");

  // ── IDEMPOTENCY ────────────────────────────────────
  console.log("[wazzup/webhook] step: before idempotency check");
  try {
    const idempotencyPromise = service
      .from("wazzup_messages")
      .select("id")
      .eq("message_id", messageId)
      .maybeSingle();

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("TIMEOUT 5000ms")), 5000)
    );

    const { data: existing, error: idempErr } = await Promise.race([
      idempotencyPromise,
      timeoutPromise,
    ]);

    console.log(
      "[wazzup/webhook] idempotency result:",
      existing?.id ?? "not found",
      idempErr?.message ?? "no error"
    );

    if (idempErr) {
      console.error("[wazzup/webhook] idempotency lookup failed");
      // продолжаем
    } else if (existing) {
      return;
    }
  } catch {
    console.error("[wazzup/webhook] idempotency check failed");
    // продолжаем несмотря на ошибку
  }
  console.log("[wazzup/webhook] step: after idempotency check");

  // ── COMPANY LOOKUP ─────────────────────────────────
  console.log("[wazzup/webhook] step: company lookup");
  const tokenPromise = service
    .from("wazzup_tokens")
    .select("company_id, allowed_chat_ids")
    .contains("channel_ids", [channelId])
    .maybeSingle();
  const { data: token, error: tokenErr } = await supabaseWithTimeout(
    tokenPromise, 5000, "company lookup"
  );
  if (tokenErr) console.error("[wazzup/webhook] company lookup failed");

  if (!token?.company_id) {
    return;
  }

  // ── ALLOWED CHATS FILTER ───────────────────────────
  const allowedChats: string[] = token.allowed_chat_ids ?? [];
  if (allowedChats.length > 0) {
    const incomingId = chatId || senderPhone;
    const isAllowed = !!incomingId && allowedChats.some((a) => a === incomingId);
    if (!isAllowed) {
      return;
    }
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
    parsed:       false,
    needs_review: false,
  };

  const { data: saved, error: insertErr } = await supabaseWithTimeout(
    service.from("wazzup_messages").insert(insertPayload).select("id").single(),
    8000, "INSERT wazzup_messages"
  );

  if (insertErr) {
    console.error("[wazzup/webhook] message insert failed");
    return;
  }

  const savedId = saved?.id ?? null;

  // Await parseAndSave — safe now that we return 200 OK before processWebhook runs
  if (savedId) {
    await parseAndSave(savedId).catch(() => {
      console.error("[wazzup/webhook] message parsing failed");
    });
  }
}
