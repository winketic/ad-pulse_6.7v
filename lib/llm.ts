import { readSecret } from "@/lib/env";

/**
 * Единая точка вызова LLM.
 *
 * Основной провайдер — alem.ai (OpenAI-совместимый, модель gemma4):
 * дешёвый, читает и текст, и изображения. Если ключа нет, падаем
 * на OpenAI. Ключи обязательно через readSecret() — они приезжают
 * из дашбордов с невидимым BOM и валят fetch.
 *
 * Проверено вручную 2026-11-08:
 *   gemma4  — точный JSON на реальных фразах, читает фото накладной;
 *   qwen3-8 — reasoning-модель, тратит весь max_tokens на размышления
 *             и возвращает пустой content. Для строгого JSON не годится.
 */

export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ChatContentPart[];
}

export interface LlmTarget {
  provider: "alem" | "openai";
  baseUrl: string;
  apiKey: string;
  model: string;
}

export function llmTarget(): LlmTarget | null {
  const alemKey = readSecret("LLM_API_KEY");
  if (alemKey) {
    return {
      provider: "alem",
      baseUrl: (readSecret("LLM_BASE_URL") || "https://llm.alem.ai/v1").replace(/\/+$/, ""),
      apiKey: alemKey,
      model: readSecret("LLM_MODEL") || "gemma4",
    };
  }

  const openaiKey = readSecret("OPENAI_API_KEY");
  if (openaiKey) {
    return {
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: openaiKey,
      model: readSecret("OPENAI_MODEL") || "gpt-4o-mini",
    };
  }

  return null;
}

export function llmAvailable(): boolean {
  return llmTarget() !== null;
}

/** Достать JSON из ответа модели, даже если она обернула его в текст. */
export function extractJson(raw: string): string | null {
  const trimmed = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  if (trimmed.startsWith("{")) {
    const end = trimmed.lastIndexOf("}");
    if (end > 0) return trimmed.slice(0, end + 1);
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return null;
}

/**
 * Один запрос к LLM. Возвращает текст ответа или null (без исключений —
 * вызывающий код всегда умеет деградировать на ключевой парсер).
 */
export async function chatCompletion(
  messages: ChatMessage[],
  options: { maxTokens?: number; temperature?: number; timeoutMs?: number; scope?: string } = {}
): Promise<string | null> {
  const target = llmTarget();
  if (!target) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);
  const scope = options.scope ?? "llm";

  try {
    const res = await fetch(`${target.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${target.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: target.model,
        max_tokens: options.maxTokens ?? 300,
        temperature: options.temperature ?? 0,
        messages,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(
        `[${scope}] ${target.provider} ответил ${res.status}: ${body.slice(0, 200)}`
      );
      return null;
    }

    const data = (await res.json()) as {
      choices?: {
        finish_reason?: string;
        message?: { content?: string | null };
      }[];
    };

    const choice = data.choices?.[0];
    const content = choice?.message?.content?.trim() ?? "";
    if (!content) {
      console.error(
        `[${scope}] ${target.model}: пустой ответ (finish_reason=${choice?.finish_reason ?? "?"})`
      );
      return null;
    }
    return content;
  } catch (err) {
    const reason = (err as Error).name === "AbortError" ? "таймаут" : (err as Error).message;
    console.error(`[${scope}] запрос к ${target.provider} не удался: ${reason}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
