"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { provisionSignedUpUser } from "@/lib/billing/provision";

/**
 * Вызывается со страницы /welcome после перехода по ссылке подтверждения:
 * сессия уже есть, компании ещё нет. Имя компании берём из формы
 * (предзаполнена тем, что ввели при регистрации).
 */
export async function activateAccount(form: { company_name: string; contact_name: string }): Promise<void> {
  const companyName = typeof form?.company_name === "string" ? form.company_name.trim() : "";
  const contactName = typeof form?.contact_name === "string" ? form.contact_name.trim() : "";
  if (!companyName || companyName.length > 160) throw new Error("Укажите название компании (до 160 символов)");
  if (!contactName || contactName.length > 120) throw new Error("Укажите ваше имя (до 120 символов)");

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login");

  const metadata = user.user_metadata ?? {};

  await provisionSignedUpUser({
    userId: user.id,
    email: user.email,
    companyName,
    contactName,
    phone: typeof metadata.phone === "string" ? metadata.phone : null,
  });

  redirect("/onboarding/setup");
}
