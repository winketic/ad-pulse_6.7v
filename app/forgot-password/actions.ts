"use server";

import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { findAuthUserByEmail } from "@/lib/supabase/inviteHelper";
import { sendPasswordResetCodeEmail } from "@/lib/billing/emails";
import {
  codeExpiresAt,
  codeMatches,
  EMAIL_CODE_MAX_ATTEMPTS,
  EMAIL_CODE_RESEND_SECONDS,
  generateSignupCode,
  generateSignupSalt,
  hashCode,
  isCodeExpired,
} from "@/lib/auth/signupCode";

type ResetMeta = {
  reset_code_hash?: string | null;
  reset_code_salt?: string | null;
  reset_code_expires_at?: string | null;
  reset_code_attempts?: number;
  reset_code_sent_at?: string | null;
};

function fail(message: string): never {
  throw new Error(message);
}

function normalizeEmail(value: unknown): string {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) fail("Укажите корректный email");
  return email;
}

/**
 * Отправляет код сброса через Resend. Если аккаунта нет, отвечаем тем же
 * успехом: иначе форма превращается в проверялку существующих адресов.
 */
export type ResetResult = { ok: true } | { ok: false; error: string };

async function requestPasswordResetCodeImpl(emailInput: string): Promise<{ ok: true }> {
  const email = normalizeEmail(emailInput);
  const service = createServiceClient();
  const user = await findAuthUserByEmail(service, email);
  if (!user) return { ok: true };

  const meta = (user.user_metadata ?? {}) as ResetMeta;
  const sentAt = meta.reset_code_sent_at ? Date.parse(meta.reset_code_sent_at) : 0;
  if (sentAt && Date.now() - sentAt < EMAIL_CODE_RESEND_SECONDS * 1000) return { ok: true };

  const code = generateSignupCode();
  const salt = generateSignupSalt();
  const { error } = await service.auth.admin.updateUserById(user.id, {
    user_metadata: {
      ...meta,
      reset_code_hash: hashCode(code, salt),
      reset_code_salt: salt,
      reset_code_expires_at: codeExpiresAt(),
      reset_code_attempts: 0,
      reset_code_sent_at: new Date().toISOString(),
    },
  });
  if (error) fail(`Не удалось сохранить код: ${error.message}`);

  try {
    await sendPasswordResetCodeEmail({ to: email, code });
  } catch (emailError) {
    const detail = emailError instanceof Error ? emailError.message : String(emailError);
    console.error("[reset] код не отправлен:", detail);
    fail(`Не удалось отправить код: ${detail}`);
  }

  return { ok: true };
}

/** Проверяет код, меняет пароль и сразу входит. */
async function resetPasswordWithCodeImpl(data: {
  email: string;
  code: string;
  password: string;
}): Promise<{ ok: true }> {
  const email = normalizeEmail(data?.email);
  const password = typeof data?.password === "string" ? data.password : "";
  if (password.length < 8) fail("Пароль — минимум 8 символов");
  const code = typeof data?.code === "string" ? data.code.trim() : "";
  if (!/^\d{6}$/.test(code)) fail("Код — 6 цифр");

  const service = createServiceClient();
  const user = await findAuthUserByEmail(service, email);
  if (!user) fail("Неверный код или он истёк");

  const meta = (user.user_metadata ?? {}) as ResetMeta;
  const attempts = Number(meta.reset_code_attempts ?? 0);
  if (attempts >= EMAIL_CODE_MAX_ATTEMPTS) fail("Слишком много попыток. Запросите новый код.");
  if (isCodeExpired(meta.reset_code_expires_at) || !meta.reset_code_hash || !meta.reset_code_salt) {
    fail("Код истёк. Запросите новый.");
  }

  if (!codeMatches(code, meta.reset_code_salt, meta.reset_code_hash)) {
    await service.auth.admin.updateUserById(user.id, {
      user_metadata: { ...meta, reset_code_attempts: attempts + 1 },
    });
    const left = EMAIL_CODE_MAX_ATTEMPTS - attempts - 1;
    fail(left > 0 ? `Неверный код. Осталось попыток: ${left}` : "Слишком много попыток. Запросите новый код.");
  }

  const { error: updateError } = await service.auth.admin.updateUserById(user.id, {
    password,
    user_metadata: {
      ...meta,
      reset_code_hash: null,
      reset_code_salt: null,
      reset_code_expires_at: null,
      reset_code_attempts: 0,
    },
  });
  if (updateError) fail(`Не удалось сменить пароль: ${updateError.message}`);

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) fail("Пароль изменён, но вход не удался. Войдите вручную.");

  return { ok: true };
}

function resetError(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  console.error("[reset]", detail);
  if (/Resend/i.test(detail)) {
    return "Почта ещё не настроена: домен отправителя не подтверждён в Resend. Напишите в поддержку.";
  }
  return detail;
}

export async function requestPasswordResetCode(email: string): Promise<ResetResult> {
  try {
    return await requestPasswordResetCodeImpl(email);
  } catch (error) {
    return { ok: false, error: resetError(error) };
  }
}

export async function resetPasswordWithCode(data: { email: string; code: string; password: string }): Promise<ResetResult> {
  try {
    return await resetPasswordWithCodeImpl(data);
  } catch (error) {
    return { ok: false, error: resetError(error) };
  }
}
