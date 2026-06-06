import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendTelegramMessage } from "@/lib/telegram/send";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  console.log("[telegram/webhook] received:", JSON.stringify(body));

  // Must await — Vercel kills the function immediately after response is sent
  if (body) {
    try {
      await processUpdate(body);
    } catch (e) {
      console.error("[telegram/webhook] processing error:", e);
    }
  }

  return Response.json({ ok: true });
}

async function processUpdate(body: unknown) {
  const payload = body as Record<string, unknown>;
  const message = payload.message as Record<string, unknown> | undefined;
  if (!message) return;

  const text = typeof message.text === "string" ? message.text.trim() : "";
  const chat = message.chat as Record<string, unknown> | undefined;
  const from = message.from as Record<string, unknown> | undefined;
  const chatId = String(chat?.id ?? "");

  console.log("[telegram] chatId:", chatId, "username:", from?.username);

  if (!chatId) return;

  if (text.startsWith("/start")) {
    await sendTelegramMessage(
      chatId,
      "👋 Добро пожаловать в AD Pulse Bot!\n\nОтправьте код подключения из настроек системы."
    );
    return;
  }

  if (/^[a-f0-9]{8}$/i.test(text)) {
    const service = createServiceClient();

    const { data, error } = await service
      .rpc("find_company_by_code", { code_prefix: text });

    const company = Array.isArray(data) ? data[0] : data;

    console.log("[telegram/webhook] company search result:", { company, error, code: text });

    if (company) {
      await service
        .from("companies")
        .update({ telegram_chat_id: chatId, telegram_connected: true })
        .eq("id", company.id);

      await sendTelegramMessage(
        chatId,
        `✅ Подключено! Компания: ${company.name}\n\nТеперь вы получаете алерты об:\n• Перерасходе материалов\n• Критических остатках\n• Браке`
      );
    } else {
      await sendTelegramMessage(
        chatId,
        `❌ Код не найден. Проверьте код в настройках AD Pulse.\n\nОшибка: ${error?.message ?? "no rows"}`
      );
    }
  }
}
