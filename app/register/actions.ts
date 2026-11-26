"use server";

import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { findAuthUserByEmail } from "@/lib/supabase/inviteHelper";
import { provisionSignedUpUser } from "@/lib/billing/provision";
import { sendSignupCodeEmail } from "@/lib/billing/emails";
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

export type ActionError = { ok: false; error: string };
export type StartRegistrationResult = { ok: true; needsCode: true; email: string } | ActionError;
export type VerifyRegistrationResult = { ok: true } | ActionError;

type SignupMeta = {
  company_name?: string;
  contact_name?: string;
  phone?: string;
  signup_code_hash?: string | null;
  signup_code_salt?: string | null;
  signup_code_expires_at?: string | null;
  signup_code_attempts?: number;
  signup_code_sent_at?: string | null;
};

function fail(message: string): never {
  throw new Error(message);
}

function normalizeEmail(value: unknown): string {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) fail("Укажите корректный email");
  return email;
}

function normalizePassword(value: unknown): string {
  const password = typeof value === "string" ? value : "";
  if (password.length < 8) fail("Пароль — минимум 8 символов");
  return password;
}

/** Записывает новый код в user_metadata и возвращает его открытым текстом. */
async function issueCode(
  service: ReturnType<typeof createServiceClient>,
  userId: string,
  meta: SignupMeta,
): Promise<string> {
  const code = generateSignupCode();
  const salt = generateSignupSalt();
  const { error } = await service.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...meta,
      signup_code_hash: hashCode(code, salt),
      signup_code_salt: salt,
      signup_code_expires_at: codeExpiresAt(),
      signup_code_attempts: 0,
      signup_code_sent_at: new Date().toISOString(),
    },
  });
  if (error) throw new Error(`Не удалось сохранить код: ${error.message}`);
  return code;
}

/**
 * Шаг 1: создаёт неподтверждённого пользователя и отправляет 6-значный код
 * через Resend. Письма Supabase не используются: их SMTP падает.
 * Компания и пилот создаются только после ввода кода.
 */
async function startRegistrationImpl(data: {
  company_name: string;
  contact_name: string;
  email: string;
  phone?: string;
  password: string;
}): Promise<{ needsCode: true; email: string }> {
  const companyName = typeof data?.company_name === "string" ? data.company_name.trim() : "";
  const contactName = typeof data?.contact_name === "string" ? data.contact_name.trim() : "";
  const phone = typeof data?.phone === "string" ? data.phone.trim() : "";
  const email = normalizeEmail(data?.email);
  const password = normalizePassword(data?.password);

  if (!companyName || companyName.length > 160) fail("Укажите название компании (до 160 символов)");
  if (!contactName || contactName.length > 120) fail("Укажите имя контактного лица (до 120 символов)");
  if (phone.length > 40) fail("Телефон слишком длинный");

  const service = createServiceClient();
  const existing = await findAuthUserByEmail(service, email);
  let userId: string;
  let createdNow = false;

  if (existing?.email_confirmed_at) {
    fail("Аккаунт с этим email уже есть. Войдите или восстановите пароль.");
  }

  if (existing) {
    // Брошенная регистрация: обновляем пароль и данные, код отправляем заново.
    const { error } = await service.auth.admin.updateUserById(existing.id, {
      password,
      user_metadata: { company_name: companyName, contact_name: contactName, phone },
    });
    if (error) fail(`Не удалось обновить аккаунт: ${error.message}`);
    userId = existing.id;
  } else {
    const { data: created, error } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
      user_metadata: { company_name: companyName, contact_name: contactName, phone },
    });
    if (error) {
      if (/already registered|already exists|duplicate/i.test(error.message)) {
        fail("Аккаунт с этим email уже есть. Войдите или восстановите пароль.");
      }
      fail(error.message);
    }
    if (!created.user) fail("Supabase не вернул пользователя");
    userId = created.user.id;
    createdNow = true;
  }

  const meta: SignupMeta = { company_name: companyName, contact_name: contactName, phone };
  const code = await issueCode(service, userId, meta);

  try {
    await sendSignupCodeEmail({ to: email, code });
  } catch (emailError) {
    if (createdNow) await service.auth.admin.deleteUser(userId);
    const detail = emailError instanceof Error ? emailError.message : String(emailError);
    console.error("[register] код не отправлен:", detail);
    fail(`Не удалось отправить код на почту: ${detail}`);
  }

  return { needsCode: true, email };
}

/** Шаг 2: проверяет код, подтверждает почту, создаёт компанию и входит. */
async function verifyRegistrationCodeImpl(data: {
  email: string;
  code: string;
  password: string;
}): Promise<{ ok: true }> {
  const email = normalizeEmail(data?.email);
  const password = normalizePassword(data?.password);
  const code = typeof data?.code === "string" ? data.code.trim() : "";
  if (!/^\d{6}$/.test(code)) fail("Код — 6 цифр");

  const service = createServiceClient();
  const user = await findAuthUserByEmail(service, email);
  if (!user) fail("Аккаунт не найден. Начните регистрацию заново.");

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  if (user.email_confirmed_at) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) fail("Аккаунт уже подтверждён. Войдите с паролем.");
    return { ok: true };
  }

  const meta = (user.user_metadata ?? {}) as SignupMeta;
  const attempts = Number(meta.signup_code_attempts ?? 0);

  if (attempts >= EMAIL_CODE_MAX_ATTEMPTS) {
    fail("Слишком много попыток. Запросите новый код.");
  }
  if (isCodeExpired(meta.signup_code_expires_at)) {
    fail("Код истёк. Запросите новый.");
  }
  if (!meta.signup_code_hash || !meta.signup_code_salt || !codeMatches(code, meta.signup_code_salt, meta.signup_code_hash)) {
    await service.auth.admin.updateUserById(user.id, {
      user_metadata: { ...meta, signup_code_attempts: attempts + 1 },
    });
    const left = EMAIL_CODE_MAX_ATTEMPTS - attempts - 1;
    fail(left > 0 ? `Неверный код. Осталось попыток: ${left}` : "Слишком много попыток. Запросите новый код.");
  }

  const { error: confirmError } = await service.auth.admin.updateUserById(user.id, {
    email_confirm: true,
    user_metadata: {
      ...meta,
      signup_code_hash: null,
      signup_code_salt: null,
      signup_code_expires_at: null,
      signup_code_attempts: 0,
    },
  });
  if (confirmError) fail(`Не удалось подтвердить почту: ${confirmError.message}`);

  await provisionSignedUpUser({
    userId: user.id,
    email,
    companyName: typeof meta.company_name === "string" && meta.company_name ? meta.company_name : "Новая компания",
    contactName: typeof meta.contact_name === "string" && meta.contact_name ? meta.contact_name : email,
    phone: typeof meta.phone === "string" ? meta.phone : null,
  });

  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) {
    console.error("[register] signIn after confirm failed:", signInError.message);
    fail("Почта подтверждена, но вход не удался. Войдите вручную.");
  }

  return { ok: true };
}

/** Повторная отправка кода: не чаще раза в минуту. */
async function resendRegistrationCodeImpl(emailInput: string): Promise<{ ok: true }> {
  const email = normalizeEmail(emailInput);
  const service = createServiceClient();
  const user = await findAuthUserByEmail(service, email);
  if (!user) fail("Аккаунт не найден. Начните регистрацию заново.");
  if (user.email_confirmed_at) fail("Почта уже подтверждена. Войдите.");

  const meta = (user.user_metadata ?? {}) as SignupMeta;
  const sentAt = meta.signup_code_sent_at ? Date.parse(meta.signup_code_sent_at) : 0;
  const waitLeft = EMAIL_CODE_RESEND_SECONDS * 1000 - (Date.now() - sentAt);
  if (sentAt && waitLeft > 0) {
    fail(`Код уже отправлен. Повторите через ${Math.ceil(waitLeft / 1000)} с.`);
  }

  const code = await issueCode(service, user.id, meta);
  try {
    await sendSignupCodeEmail({ to: email, code });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(`Не удалось отправить код: ${detail}`);
  }
  return { ok: true };
}

function errorMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  console.error("[register]", detail);
  if (/Resend/i.test(detail)) {
    return "Почта ещё не настроена: домен отправителя не подтверждён в Resend. Напишите на altai.dx@gmail.com.";
  }
  return detail;
}

export async function startRegistration(data: Parameters<typeof startRegistrationImpl>[0]): Promise<StartRegistrationResult> {
  try {
    const result = await startRegistrationImpl(data);
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function verifyRegistrationCode(data: Parameters<typeof verifyRegistrationCodeImpl>[0]): Promise<VerifyRegistrationResult> {
  try {
    return await verifyRegistrationCodeImpl(data);
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function resendRegistrationCode(email: string): Promise<{ ok: true } | ActionError> {
  try {
    return await resendRegistrationCodeImpl(email);
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}
