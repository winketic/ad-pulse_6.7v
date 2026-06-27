import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendTelegramMessage } from "@/lib/telegram/send";

const RATE_LIMIT_MAX_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

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

    // Rate limit: max 5 failed attempts per chat_id per 10-minute window.
    // Successful binds don't count and reset the counter.
    const { data: rl } = await service
      .from("telegram_rate_limits")
      .select("attempts, window_start")
      .eq("chat_id", chatId)
      .maybeSingle();

    const windowExpired =
      !rl || Date.now() - new Date(rl.window_start).getTime() > RATE_LIMIT_WINDOW_MS;

    if (!windowExpired && rl && rl.attempts >= RATE_LIMIT_MAX_ATTEMPTS) {
      await sendTelegramMessage(
        chatId,
        "⏳ Слишком много попыток. Подождите 10 минут и попробуйте снова."
      );
      return;
    }

    const { data, error } = await service
      .rpc("find_company_by_code", { code_prefix: text });

    const company = Array.isArray(data) ? data[0] : data;

    console.log("[telegram/webhook] company search result:", { company, error, code: text });

    if (company) {
      const { data: prevCompany } = await service
        .from("companies")
        .select("telegram_chat_id")
        .eq("id", company.id)
        .single();
      const previousChatId = prevCompany?.telegram_chat_id ?? null;

      await service
        .from("companies")
        .update({ telegram_chat_id: chatId, telegram_connected: true })
        .eq("id", company.id);

      // Successful bind — clear this chat's failed-attempt counter.
      await service.from("telegram_rate_limits").delete().eq("chat_id", chatId);

      await sendTelegramMessage(
        chatId,
        `✅ Подключено! Компания: ${company.name}\n\nТеперь вы получаете алерты об:\n• Перерасходе материалов\n• Критических остатках\n• Браке`
      );

      // Tell whoever was previously connected — if a code was hijacked,
      // this is how the real admin finds out.
      if (previousChatId && previousChatId !== chatId) {
        await sendTelegramMessage(
          previousChatId,
          `⚠️ Подключение алертов AD Pulse для компании «${company.name}» было переключено на другой Telegram-чат.\n\nЕсли это сделали не вы — срочно проверьте код подключения в настройках AD Pulse и подключите бота заново.`
        );
      }
    } else {
      const newAttempts = (windowExpired ? 0 : rl?.attempts ?? 0) + 1;
      const newWindowStart = windowExpired
        ? new Date().toISOString()
        : rl?.window_start ?? new Date().toISOString();

      await service
        .from("telegram_rate_limits")
        .upsert({ chat_id: chatId, attempts: newAttempts, window_start: newWindowStart }, { onConflict: "chat_id" });

      await sendTelegramMessage(
        chatId,
        `❌ Код не найден. Проверьте код в настройках AD Pulse.\n\nОшибка: ${error?.message ?? "no rows"}`
      );
    }
  }
}
