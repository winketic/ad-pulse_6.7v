import { config, webhookUrl } from "./config";
import { logger } from "./logger";
import type { SessionStatusMessage, WebhookEvent } from "./types";

const log = logger("webhook");

const RETRY_DELAYS_MS = [1_000, 5_000, 15_000];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Отправить сообщения в AD Pulse. Ретраи — потому что приложение может быть
 * на редеплое, а потерянное сообщение о расходе материала клиент заметит
 * только по остаткам на складе.
 */
export async function deliver(payload: WebhookEvent): Promise<boolean> {
  const url = webhookUrl();

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Gateway-Token": config.gatewayToken,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        log.debug(`доставлено ${payload.data.length} сообщ. (${res.status})`);
        return true;
      }

      // 4xx кроме 429 бесполезно ретраить — приложение отвергло payload.
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        const body = await res.text().catch(() => "");
        log.error(`вебхук отклонён ${res.status}: ${body.slice(0, 300)}`);
        return false;
      }
      log.warn(`вебхук вернул ${res.status}, попытка ${attempt + 1}`);
    } catch (err) {
      log.warn(`вебхук не доставлен, попытка ${attempt + 1}`, err);
    }

    const delay = RETRY_DELAYS_MS[attempt];
    if (delay === undefined) break;
    await sleep(delay);
  }

  // Не теряем молча: пишем в лог в формате, который можно поднять руками.
  log.error(
    `не удалось доставить вебхук, сообщений потеряно: ${payload.data.length}`,
    payload.data.map((m) => ("message_id" in m ? m.message_id : m.company_id))
  );
  return false;
}

/** Отправить одно сообщение (удобная обёртка для обработчика Baileys). */
export async function deliverMessages(
  messages: Extract<WebhookEvent, { event: "message.add" }>["data"]
): Promise<void> {
  if (messages.length === 0) return;
  await deliver({
    event: "message.add",
    provider: "adpulse-gateway",
    data: messages,
    meta: {
      idempotency_key: crypto.randomUUID(),
      timestamp: Math.floor(Date.now() / 1000),
    },
  });
}

/** Сообщить приложению о смене состояния сессии (подключено / отвязано / ошибка). */
export async function deliverSessionStatus(
  message: SessionStatusMessage
): Promise<void> {
  await deliver({
    event: "session.status",
    provider: "adpulse-gateway",
    data: [message],
    meta: {
      idempotency_key: crypto.randomUUID(),
      timestamp: Math.floor(Date.now() / 1000),
    },
  });
}
