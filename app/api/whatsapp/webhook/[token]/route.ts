import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { parseAndSave } from "@/lib/wazzup/parseAndSave";
import { sendTelegramAlert } from "@/lib/telegram/send";
import { GATEWAY_PROVIDER } from "@/lib/whatsapp/gateway";

// Разбор медиа (фото накладной, голосовое) может занять время
export const maxDuration = 60;
export const dynamic = "force-dynamic";

interface InboundMessage {
  message_id: string;
  company_id: string;
  chat_id: string;
  chat_name: string;
  chat_type: string;
  sender_name: string | null;
  sender_phone: string | null;
  text: string | null;
  content_type: "text" | "voice" | "image" | "document" | "other";
  media_url: string | null;
  media_mimetype: string | null;
  media_name: string | null;
  timestamp: number;
}

const VALID_CONTENT_TYPES = new Set(["text", "voice", "image", "document", "other"]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  // URL-секрет: шлюз шлёт его в пути, как и раньше делал Wazzup.
  const { token } = await params;
  const expected = (process.env.WHATSAPP_WEBHOOK_TOKEN ?? "").trim();
  if (!expected || token !== expected) {
    console.warn("[whatsapp/webhook] отклонено: неверный токен");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { event?: string; data?: unknown[] }
    | null;

  if (!body || !Array.isArray(body.data)) {
    return NextResponse.json({ ok: true, skipped: "no data" });
  }

  // Смена состояния сессии: приложение узнаёт, что WhatsApp отвалился,
  // не дожидаясь, пока админ откроет настройки.
  if (body.event === "session.status") {
    void processSessionStatuses(body.data as SessionStatusItem[]).catch((err) =>
      console.error("[whatsapp/webhook] status processing failed", err)
    );
    return NextResponse.json({ ok: true });
  }

  if (body.event === "message.add") {
    // Отладочный режим: тот, кто знает токен вебхука, может дождаться обработки
    // и увидеть причину отказа. Обычный вызов отвечает 200 сразу.
    const wantsDebug =
      request.headers.get("x-whatsapp-debug") === expected;
    if (wantsDebug) {
      const errors = await processMessages(body.data as InboundMessage[]);
      return NextResponse.json({ ok: errors.length === 0, errors });
    }

    void processMessages(body.data as InboundMessage[]).catch((err) =>
      console.error("[whatsapp/webhook] processing failed", err)
    );
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true, skipped: "unsupported event" });
}

interface SessionStatusItem {
  company_id: string;
  status: string;
  phone_number: string | null;
  last_error: string | null;
  updated_at: string;
}

async function processSessionStatuses(items: SessionStatusItem[]): Promise<void> {
  const service = createServiceClient();

  for (const item of items) {
    if (!item?.company_id) continue;

    try {
      const { error } = await service.from("whatsapp_sessions").upsert(
        {
          company_id: item.company_id,
          status: item.status,
          phone_number: item.phone_number,
          last_error: item.last_error,
          last_seen_at: item.updated_at ?? new Date().toISOString(),
        },
        { onConflict: "company_id" }
      );
      if (error) {
        console.warn("[whatsapp/webhook] статус не сохранён:", error.message);
      }
    } catch (err) {
      console.error("[whatsapp/webhook] статус не сохранён", err);
    }

    // Тихий отказ — самый опасный сценарий: клиент думает, что учёт работает,
    // а сообщения не поступают. Поэтому пишем в Telegram, а не только в UI.
    if (item.status === "logged_out" || item.status === "failed") {
      const reason =
        item.status === "logged_out"
          ? "WhatsApp отвязал устройство"
          : "не удалось подключиться к WhatsApp";
      await sendTelegramAlert(
        item.company_id,
        `⚠️ <b>WhatsApp отключён</b>\n\n${reason}.\nСообщения в учёт материалов не поступают.\n\nОткройте AD Pulse → WhatsApp → Настройки → «Подключить номер и выбрать чаты», чтобы привязать номер заново.`
      ).catch((err) => console.error("[whatsapp/webhook] telegram alert failed", err));
    }
  }
}

async function processMessages(messages: InboundMessage[]): Promise<string[]> {
  const service = createServiceClient();
  const errors: string[] = [];

  for (const msg of messages) {
    try {
      const reason = await processOne(service, msg);
      if (reason) errors.push(`${msg?.message_id}: ${reason}`);
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      errors.push(`${msg?.message_id}: ${text}`);
      console.error("[whatsapp/webhook] сообщение пропущено", msg?.message_id, err);
    }
  }
  return errors;
}

type ServiceClient = ReturnType<typeof createServiceClient>;

async function processOne(service: ServiceClient, msg: InboundMessage): Promise<string | null> {
  if (!msg?.message_id || !msg.company_id || !msg.chat_id) return "неполный payload";

  // ── Компания должна иметь подключённую сессию ──────────────────────────
  // company_id приходит от шлюза, но принимаем его только если для компании
  // реально существует сессия WhatsApp. Чужой company_id не пройдёт.
  const { data: sessionRow } = await service
    .from("whatsapp_sessions")
    .select("company_id, status")
    .eq("company_id", msg.company_id)
    .maybeSingle();

  if (!sessionRow) {
    console.warn(
      `[whatsapp/webhook] нет сессии для компании ${msg.company_id} — сообщение отброшено`
    );
    return "нет сессии WhatsApp для компании";
  }

  // ── Чат: запомнить в любом случае, обрабатывать — только отмеченные ────
  const { data: chatRow } = await service
    .from("whatsapp_chats")
    .select("is_watched, chat_name")
    .eq("company_id", msg.company_id)
    .eq("chat_jid", msg.chat_id)
    .maybeSingle();

  const isWatched = Boolean(chatRow?.is_watched);

  await service.from("whatsapp_chats").upsert(
    {
      company_id: msg.company_id,
      chat_jid: msg.chat_id,
      chat_name: msg.chat_name || chatRow?.chat_name || "",
      chat_type: msg.chat_type === "whatsgroup" ? "whatsgroup" : "whatsapp",
      // Для групп sender_phone — это телефон участника, а не самого чата.
      phone: msg.chat_type === "whatsgroup" ? null : msg.sender_phone,
      last_message_at: new Date(msg.timestamp).toISOString(),
      is_watched: isWatched,
    },
    { onConflict: "company_id,chat_jid" }
  );

  // Новый чат появляется в списке выбора, но по умолчанию выключен:
  // клиент сам решит, что чекать. Молча включённый чат = мусор в отчётах.
  if (!isWatched) return `чат ${msg.chat_id} не отмечен для разбора`;

  // ── Идемпотентность ────────────────────────────────────────────────────
  const { data: existing } = await service
    .from("wazzup_messages")
    .select("id")
    .eq("message_id", msg.message_id)
    .maybeSingle();

  if (existing?.id) return null; // дубль

  const { data: saved, error } = await service
    .from("wazzup_messages")
    .insert({
      company_id: msg.company_id,
      message_id: msg.message_id,
      channel_id: "whatsapp-gateway",
      direction: "inbound",
      sender_phone: msg.sender_phone,
      raw_text: msg.text,
      content_type: VALID_CONTENT_TYPES.has(msg.content_type)
        ? msg.content_type
        : "other",
      media_url: msg.media_url,
      chat_id: msg.chat_id,
      chat_name: msg.chat_name,
      chat_type: msg.chat_type,
      provider: GATEWAY_PROVIDER,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[whatsapp/webhook] insert failed:", error.message);
    return `insert failed: ${error.message}`;
  }

  if (saved?.id) {
    await parseAndSave(saved.id).catch((err) =>
      console.error("[whatsapp/webhook] parseAndSave failed", err)
    );
  }
  return null;
}
