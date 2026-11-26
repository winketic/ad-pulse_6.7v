// Обращения в поддержку: сохраняем в базу и пересылаем на altai.dx@gmail.com.
// Письмо — основной канал: если Resend недоступен, обращение всё равно
// остаётся в support_requests, а в ответе видно, что письмо не ушло.

import { createServiceClient } from "@/lib/supabase/service";
import { sendSupportRequestEmail } from "@/lib/billing/emails";
import { PLATFORM_OWNER_EMAIL } from "@/lib/auth/platform-owner";

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 3;

export type SupportInput = {
  name?: string | null;
  email: string;
  subject: string;
  message: string;
  source: "dashboard" | "public";
  companyId?: string | null;
  userId?: string | null;
  companyName?: string | null;
};

export type SupportResult = { id: string; emailSent: boolean };

export async function submitSupportRequest(input: SupportInput): Promise<SupportResult> {
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const subject = typeof input.subject === "string" ? input.subject.trim() : "";
  const message = typeof input.message === "string" ? input.message.trim() : "";
  const name = typeof input.name === "string" ? input.name.trim() : "";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error("Укажите корректный email");
  if (subject.length < 3 || subject.length > 160) throw new Error("Тема — от 3 до 160 символов");
  if (message.length < 10 || message.length > 4000) throw new Error("Сообщение — от 10 до 4000 символов");
  if (name.length > 120) throw new Error("Имя слишком длинное");

  const service = createServiceClient();

  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const { count } = await service
    .from("support_requests")
    .select("id", { count: "exact", head: true })
    .eq("email", email)
    .gte("created_at", since);

  if ((count ?? 0) >= RATE_LIMIT_MAX) {
    throw new Error("Слишком много обращений. Попробуйте через 10 минут.");
  }

  const { data, error } = await service
    .from("support_requests")
    .insert({
      company_id: input.companyId ?? null,
      user_id: input.userId ?? null,
      name: name || null,
      email,
      subject,
      message,
      source: input.source,
    })
    .select("id")
    .single();

  if (error || !data) {
    const missingTable = Boolean(error && /does not exist|schema cache|PGRST205|42P01/i.test(error.message));
    if (!missingTable) throw new Error(`Не удалось сохранить обращение: ${error?.message ?? "нет ответа"}`);

    // Окно до применения миграции 059: таблицы ещё нет, но письмо владельцу
    // всё равно должно уйти — поддержка не должна зависеть от порядка деплоя.
    try {
      await sendSupportRequestEmail({
        to: PLATFORM_OWNER_EMAIL,
        fromEmail: email,
        fromName: name || null,
        companyName: input.companyName ?? null,
        subject,
        message,
        source: input.source,
      });
      return { id: "not-stored", emailSent: true };
    } catch (emailError) {
      const detail = emailError instanceof Error ? emailError.message : String(emailError);
      throw new Error(`Обращение не сохранено, письмо не ушло: ${detail}`);
    }
  }

  let emailSent = false;
  try {
    await sendSupportRequestEmail({
      to: PLATFORM_OWNER_EMAIL,
      fromEmail: email,
      fromName: name || null,
      companyName: input.companyName ?? null,
      subject,
      message,
      source: input.source,
    });
    emailSent = true;
    await service.from("support_requests").update({ emailed_at: new Date().toISOString() }).eq("id", data.id);
  } catch (emailError) {
    const detail = emailError instanceof Error ? emailError.message : String(emailError);
    console.error("[support] письмо не ушло:", detail);
    await service.from("support_requests").update({ email_error: detail.slice(0, 500) }).eq("id", data.id);
  }

  return { id: data.id, emailSent };
}
