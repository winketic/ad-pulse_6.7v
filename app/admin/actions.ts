"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isPlatformOwnerEmail } from "@/lib/auth/platform-owner";
import { sendTelegramMessage } from "@/lib/telegram/send";
import { escapeHtml } from "@/lib/utils/escapeHtml";
import { findAuthUserByEmail } from "@/lib/supabase/inviteHelper";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://ad-pulse-eight.vercel.app").replace(/\/$/, "");

async function requireAdmin() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isPlatformOwnerEmail(user.email)) throw new Error("Доступ запрещён");
  return user;
}

export async function approveRegistration(id: string) {
  await requireAdmin();
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Некорректный ID заявки");
  const service = createServiceClient();

  const { data: reg, error: regErr } = await service
    .from("registrations")
    .update({ status: "processing" })
    .eq("id", id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();

  if (regErr) throw new Error(`Не удалось зарезервировать заявку: ${regErr.message}`);
  if (!reg) throw new Error("Заявка уже обработана или сейчас обрабатывается");

  let companyId: string | null = null;
  try {
    let userId: string | undefined = (await findAuthUserByEmail(service, reg.email))?.id;

    if (userId) {
      const { data: existingProfile, error } = await service
        .from("profiles")
        .select("company_id")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw new Error(`Не удалось проверить профиль клиента: ${error.message}`);
      if (existingProfile?.company_id) {
        throw new Error("Этот аккаунт уже состоит в компании. Заявку нельзя привязать к нему повторно.");
      }
    } else {
      const { data: invited, error } = await service.auth.admin.inviteUserByEmail(reg.email, {
        redirectTo: `${APP_URL}/auth/confirm?next=/invite`,
      });
      if (error) throw new Error(`Не удалось отправить приглашение: ${error.message}`);
      userId = invited.user?.id;
      if (!userId) throw new Error("Не удалось получить ID приглашённого пользователя");
    }

    const { data: company, error: companyError } = await service
      .from("companies")
      .insert({ name: reg.company_name })
      .select("id")
      .single();
    if (companyError || !company) throw new Error(`Ошибка создания компании: ${companyError?.message ?? "нет ответа"}`);
    companyId = company.id;

    const { error: profileError } = await service.from("profiles").insert({
      id: userId,
      company_id: companyId,
      role: "admin",
      full_name: reg.contact_name,
    });
    if (profileError) throw new Error(`Ошибка создания профиля: ${profileError.message}`);

    const { data: completed, error: finishError } = await service
      .from("registrations")
      .update({ status: "approved" })
      .eq("id", id)
      .eq("status", "processing")
      .select("id")
      .maybeSingle();
    if (finishError || !completed) throw new Error(`Не удалось завершить заявку: ${finishError?.message ?? "заявка изменилась"}`);

    void sendTelegramMessage(
      "1700146125",
      `✅ Заявка одобрена!\n🏢 ${escapeHtml(reg.company_name)}\n📧 ${escapeHtml(reg.email)}\n\n` +
        `<a href="${APP_URL}/admin/registrations">👉 Открыть заявки</a>`,
    ).catch((error) => console.error("[approveRegistration] Telegram notification failed:", error));
    revalidatePath("/admin/registrations");
  } catch (error) {
    if (companyId) await service.from("companies").delete().eq("id", companyId);
    await service.from("registrations").update({ status: "pending" }).eq("id", id).eq("status", "processing");
    throw error;
  }
}

export async function rejectRegistration(id: string) {
  await requireAdmin();
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Некорректный ID заявки");
  const service = createServiceClient();

  const { data, error } = await service
    .from("registrations")
    .update({ status: "rejected" })
    .eq("id", id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Заявка уже обработана или сейчас обрабатывается");
  revalidatePath("/admin/registrations");
}
