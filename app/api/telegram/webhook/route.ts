import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendTelegramMessage } from "@/lib/telegram/send";
import { safeEqualString } from "@/lib/telegram/secret";

type ConnectAttemptRow = {
  allowed: boolean;
  attempts_left: number;
  retry_after_seconds: number;
};

type CompanyRow = {
  id: string;
  name: string;
};

type ServiceClient = ReturnType<typeof createServiceClient>;

type PostgrestErrorLike = { code?: string; message?: string } | null;

/** Диагностика БД — только в серверный лог, никогда в текст для Telegram. */
function logDbError(context: string, err: PostgrestErrorLike): void {
  console.error(
    `[telegram/webhook] ${context}:`,
    err?.code ?? err?.message ?? "unknown error"
  );
}

/**
 * Атомарный лимитер попыток подключения (миграция 051): проверка и инкремент
 * идут одной RPC-транзакцией под блокировкой строки, поэтому параллельный
 * залп больше не обходит лимит 5 попыток за 10 минут.
 *
 * Возвращает null, если RPC недоступен (миграция не применена, сбой БД/сети):
 * лимитер — не источник истины, подключение продолжаем (fail-open), но сбой
 * пишем в лог, а не проглатываем молча.
 */
async function registerConnectAttempt(
  service: ServiceClient,
  chatId: string,
  success: boolean
): Promise<ConnectAttemptRow | null> {
  const { data, error } = await service.rpc("telegram_register_connect_attempt", {
    p_chat_id: chatId,
    p_success: success,
  });

  if (error) {
    logDbError("rate-limiter RPC failed — fail-open", error);
    return null;
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | ConnectAttemptRow
    | null
    | undefined;

  return row && typeof row.allowed === "boolean" ? row : null;
}

export async function POST(request: NextRequest) {
  const expected = (process.env.TELEGRAM_WEBHOOK_SECRET ?? "").trim();

  if (expected === "") {
    // Deliberate fail-open so a deploy without the env var cannot break prod alerts.
    console.error(
      "[telegram/webhook] TELEGRAM_WEBHOOK_SECRET is not set — webhook is FAIL-OPEN and accepts unauthenticated updates. Set it in Vercel (Production+Preview), redeploy, then POST /api/telegram/setup with X-Setup-Secret to register secret_token."
    );
  } else {
    const got = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
    if (!safeEqualString(got, expected)) {
      // Never log the received value.
      console.warn(
        "[telegram/webhook] rejected update: missing or invalid X-Telegram-Bot-Api-Secret-Token"
      );
      return Response.json({ ok: false }, { status: 401 });
    }
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }


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
  const chatId = String(chat?.id ?? "");


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

    // Лимит: 5 неудачных попыток на chat_id за окно 10 минут. Pre-check
    // атомарно резервирует попытку (и инкрементирует счётчик), поэтому
    // параллельный залп не проскакивает лимит. Успешная привязка ниже
    // сбрасывает счётчик. Правильный код при исчерпанном лимите тоже
    // получает отказ — валидность кода не раскрывается.
    const gate = await registerConnectAttempt(service, chatId, false);

    if (gate?.allowed === false) {
      await sendTelegramMessage(
        chatId,
        "⏳ Слишком много попыток. Подождите 10 минут и попробуйте снова."
      );
      return;
    }

    const { data, error } = await service
      .rpc("find_company_by_code", { code_prefix: text });

    const company = (Array.isArray(data) ? data[0] : data) as
      | CompanyRow
      | null
      | undefined;

    if (error) logDbError("company lookup failed", error);

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
      await registerConnectAttempt(service, chatId, true);

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
      // Счётчик попытки уже инкрементирован атомарным pre-check вызовом выше.
      // Нейтральный текст: детали БД (error.message/error.code) остаются
      // только в console.error — неаутентифицированному собеседнику их не отдаём.
      await sendTelegramMessage(
        chatId,
        "❌ Код не найден. Проверьте код в настройках AD Pulse."
      );
    }
  }
}
