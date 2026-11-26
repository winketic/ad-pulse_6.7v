"use server";

import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { provisionSignedUpUser } from "@/lib/billing/provision";

export type RegisterResult = {
  /** true — Supabase требует подтвердить почту перед входом. */
  needsConfirmation: boolean;
  /** true — такой email уже зарегистрирован (Supabase не раскрывает это ошибкой). */
  existingAccount?: boolean;
};

function fail(message: string): never {
  throw new Error(message);
}

/**
 * Self-serve регистрация: аккаунт Supabase + компания + 30-дневный пилот.
 * Никакого одобрения админом: provisionSignedUpUser вызывается сразу, как
 * только Supabase вернул сессию. Если проект требует подтверждение почты,
 * компания создаётся после перехода по ссылке — на /welcome.
 */
export async function registerCompany(data: {
  company_name: string;
  contact_name: string;
  email: string;
  phone?: string;
  password: string;
}): Promise<RegisterResult> {
  const companyName = typeof data?.company_name === "string" ? data.company_name.trim() : "";
  const contactName = typeof data?.contact_name === "string" ? data.contact_name.trim() : "";
  const email = typeof data?.email === "string" ? data.email.trim().toLowerCase() : "";
  const phone = typeof data?.phone === "string" ? data.phone.trim() : "";
  const password = typeof data?.password === "string" ? data.password : "";

  if (!companyName || companyName.length > 160) fail("Укажите название компании (до 160 символов)");
  if (!contactName || contactName.length > 120) fail("Укажите имя контактного лица (до 120 символов)");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) fail("Укажите корректный email");
  if (phone.length > 40) fail("Телефон слишком длинный");
  if (password.length < 8) fail("Пароль — минимум 8 символов");

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://pulse.altaidynamics.kz").replace(/\/$/, "");

  const { data: signUp, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { company_name: companyName, contact_name: contactName, phone },
      emailRedirectTo: `${appUrl}/auth/confirm?next=/welcome`,
    },
  });

  if (error) {
    if (/already registered/i.test(error.message)) fail("Аккаунт с этим email уже есть. Войдите или восстановите пароль.");
    if (/rate limit|too many/i.test(error.message)) fail("Слишком много попыток. Подождите несколько минут.");
    if (/password/i.test(error.message)) fail("Пароль не подошёл: минимум 8 символов, без очевидных комбинаций.");
    fail(error.message);
  }

  const user = signUp.user;
  if (!user) fail("Supabase не вернул пользователя. Попробуйте ещё раз.");

  // При включённом подтверждении почты Supabase на существующий адрес
  // возвращает пользователя без identities и не отправляет письмо.
  if (Array.isArray(user.identities) && user.identities.length === 0) {
    return { needsConfirmation: false, existingAccount: true };
  }

  if (!signUp.session) return { needsConfirmation: true };

  await provisionSignedUpUser({
    userId: user.id,
    email,
    companyName,
    contactName,
    phone: phone || null,
  });

  return { needsConfirmation: false };
}
