import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAdminCompany } from "@/lib/whatsapp/auth";
import { GatewayError, listChats } from "@/lib/whatsapp/gateway";

export const dynamic = "force-dynamic";

export interface ChatOption {
  jid: string;
  name: string;
  isGroup: boolean;
  phone: string | null;
  lastMessageAt: string | null;
  isWatched: boolean;
}

/**
 * GET — список чатов клиента.
 *
 * Источник: шлюз (там свежие названия и последняя активность). Если шлюз
 * недоступен, отдаём то, что уже сохранено в БД, — настройки не должны
 * превращаться в пустой экран из-за лежащего VPS.
 */
export async function GET() {
  const companyId = await getAdminCompany();
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();

  const { data: savedRows } = await service
    .from("whatsapp_chats")
    .select("*")
    .eq("company_id", companyId);

  const saved = new Map<string, { isWatched: boolean; name: string }>();
  for (const row of savedRows ?? []) {
    saved.set(row.chat_jid as string, {
      isWatched: Boolean(row.is_watched),
      name: (row.chat_name as string) ?? "",
    });
  }

  let gatewayChats: Awaited<ReturnType<typeof listChats>> = [];
  let gatewayError: string | null = null;

  try {
    gatewayChats = await listChats(companyId);
  } catch (err) {
    gatewayError =
      err instanceof GatewayError ? err.message : "Шлюз WhatsApp недоступен";
    console.warn("[whatsapp/chats] gateway unavailable:", gatewayError);
  }

  const chats: ChatOption[] = gatewayChats.map((chat) => ({
    jid: chat.jid,
    name: chat.name || saved.get(chat.jid)?.name || chat.phone || chat.jid,
    isGroup: chat.isGroup,
    phone: chat.phone,
    lastMessageAt: chat.lastMessageAt
      ? new Date(chat.lastMessageAt).toISOString()
      : null,
    isWatched: saved.get(chat.jid)?.isWatched ?? false,
  }));

  // Чаты, отмеченные ранее, но пропавшие из свежей выдачи — оставляем,
  // иначе клиент молча потеряет уже настроенный фильтр.
  for (const [jid, meta] of saved) {
    if (meta.isWatched && !chats.some((c) => c.jid === jid)) {
      chats.push({
        jid,
        name: meta.name || jid,
        isGroup: jid.endsWith("@g.us"),
        phone: null,
        lastMessageAt: null,
        isWatched: true,
      });
    }
  }

  if (gatewayChats.length > 0) {
    const rows = gatewayChats.map((chat) => ({
      company_id: companyId,
      chat_jid: chat.jid,
      chat_name: chat.name || "",
      chat_type: chat.isGroup ? "whatsgroup" : "whatsapp",
      phone: chat.phone,
      last_message_at: chat.lastMessageAt
        ? new Date(chat.lastMessageAt).toISOString()
        : null,
      is_watched: saved.get(chat.jid)?.isWatched ?? false,
    }));
    const { error } = await service
      .from("whatsapp_chats")
      .upsert(rows, { onConflict: "company_id,chat_jid", ignoreDuplicates: false });
    if (error) console.warn("[whatsapp/chats] upsert skipped:", error.message);
  }

  return NextResponse.json({ chats, gatewayError });
}

/** PATCH — включить/выключить обработку чата. Фильтр всегда по jid. */
export async function PATCH(request: NextRequest) {
  const companyId = await getAdminCompany();
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    jid?: string;
    isWatched?: boolean;
    name?: string;
  };

  const jid = body.jid?.trim();
  if (!jid) return NextResponse.json({ error: "jid обязателен" }, { status: 400 });

  const service = createServiceClient();
  const { error } = await service.from("whatsapp_chats").upsert(
    {
      company_id: companyId,
      chat_jid: jid,
      chat_name: body.name?.trim() ?? "",
      chat_type: jid.endsWith("@g.us") ? "whatsgroup" : "whatsapp",
      is_watched: Boolean(body.isWatched),
    },
    { onConflict: "company_id,chat_jid" }
  );

  if (error) {
    console.error("[whatsapp/chats] update failed:", error.message);
    return NextResponse.json({ error: "Ошибка сохранения" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, jid, isWatched: Boolean(body.isWatched) });
}
