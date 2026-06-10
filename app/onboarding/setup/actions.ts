"use server";

import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
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
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://ad-pulse-eight.vercel.app").replace(/\/$/, "");

    const { data: inviteData, error: inviteError } = await service.auth.admin.inviteUserByEmail(
      cleanEmail,
      { redirectTo: `${appUrl}/auth/confirm?next=/invite` }
    );

    let userId: string;
    if (inviteError) {
      const alreadyExists =
        inviteError.message.toLowerCase().includes("already registered") ||
        inviteError.message.toLowerCase().includes("already in use") ||
        inviteError.status === 422;
      if (!alreadyExists) return { error: inviteError.message };

      const { data: authList } = await service.auth.admin.listUsers({ perPage: 1000 });
      const found = (authList?.users ?? []).find((u) => u.email?.toLowerCase() === cleanEmail);
      if (!found) return { error: "Пользователь не найден" };
      userId = found.id;
    } else {
      if (!inviteData?.user) return { error: "Ошибка создания пользователя" };
      userId = inviteData.user.id;
    }

    const { error: profileError } = await service.from("profiles").upsert(
      { id: userId, company_id: companyId, role, full_name: cleanEmail },
      { onConflict: "id" }
    );
    if (profileError) return { error: profileError.message };

    revalidatePath("/dashboard/settings");
    return { ok: true, emailSent: true };
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
