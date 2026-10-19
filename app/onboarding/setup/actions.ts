"use server";

import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createInviteAndSendEmail, findAuthUserByEmail } from "@/lib/supabase/inviteHelper";
import { revalidatePath } from "next/cache";

async function getAdminSession() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Не авторизован");

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id, role")
    .eq("id", user.id)
    .single();

  if (!profile?.company_id) throw new Error("Компания не найдена");
  if (profile.role !== "admin") throw new Error("Только администратор может завершать настройку компании");
  return { userId: user.id, companyId: profile.company_id as string, role: profile.role as string };
}

export async function addSetupMaterial(
  name: string,
  unit: string
): Promise<{ id: string } | { error: string }> {
  try {
    const { companyId, userId } = await getAdminSession();
    const trimName = name.trim();
    if (!trimName) return { error: "Название обязательно" };
    if (trimName.length > 160) return { error: "Название слишком длинное" };
    if (!unit) return { error: "Единица измерения обязательна" };

    const service = createServiceClient();
    const { data, error } = await service
      .from("materials")
      .insert({ company_id: companyId, name: trimName, unit })
      .select("id")
      .single();

    if (error) return { error: error.message };
    void userId;
    return { id: data.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
}

export async function inviteSetupMember(
  email: string,
  role: string
): Promise<{ ok: true; emailSent: boolean } | { error: string }> {
  try {
    const { companyId, role: myRole } = await getAdminSession();
    if (myRole !== "admin") return { error: "Только администратор может приглашать" };
    if (!["manager", "warehouse", "workshop"].includes(role)) return { error: "Некорректная роль" };

    const service = createServiceClient();
    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || cleanEmail.length > 254) return { error: "Укажите корректный email" };

    const existingUser = await findAuthUserByEmail(service, cleanEmail);
    if (existingUser) {
      const { data: existingProfile, error } = await service
        .from("profiles")
        .select("company_id")
        .eq("id", existingUser.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (existingProfile?.company_id) {
        return { error: existingProfile.company_id === companyId ? "Пользователь уже состоит в вашей компании" : "Пользователь уже состоит в другой компании" };
      }
    }

    // См. комментарий в settings/actions.ts: встроенная почта Supabase
    // не доставляет приглашения людям вне проекта, поэтому идём через Resend.
    const { userId, emailSent } = await createInviteAndSendEmail(cleanEmail);

    const { error: profileError } = await service.from("profiles").insert(
      { id: userId, company_id: companyId, role, full_name: cleanEmail },
    );
    if (profileError) return { error: profileError.message };

    revalidatePath("/dashboard/settings");
    return { ok: true, emailSent };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
}

export async function markSetupCompleted(): Promise<void> {
  const { companyId } = await getAdminSession();
  const service = createServiceClient();
  const { error } = await service
    .from("companies")
    .update({ setup_completed: true })
    .eq("id", companyId);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}
