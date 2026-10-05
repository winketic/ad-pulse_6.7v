"use server";

import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createInviteAndSendEmail } from "@/lib/supabase/inviteHelper";
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

    const service = createServiceClient();
    const cleanEmail = email.trim().toLowerCase();

    // См. комментарий в settings/actions.ts: встроенная почта Supabase
    // не доставляет приглашения людям вне проекта, поэтому идём через Resend.
    const { userId, emailSent } = await createInviteAndSendEmail(cleanEmail);

    const { error: profileError } = await service.from("profiles").upsert(
      { id: userId, company_id: companyId, role, full_name: cleanEmail },
      { onConflict: "id" }
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
  await service
    .from("companies")
    .update({ setup_completed: true })
    .eq("id", companyId);
  revalidatePath("/dashboard");
}
