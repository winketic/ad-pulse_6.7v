"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

async function getContext() {
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
  if (profile.role !== "admin" && profile.role !== "manager")
    throw new Error("Нет прав");
  return { companyId: profile.company_id as string };
}

export async function saveThreshold(
  materialId: string,
  minQuantity: number
): Promise<{ ok: true } | { error: string }> {
  try {
    const { companyId } = await getContext();
    const service = createServiceClient();
    const { error } = await service
      .from("material_thresholds")
      .upsert(
        { company_id: companyId, material_id: materialId, min_quantity: minQuantity },
        { onConflict: "company_id,material_id" }
      );
    if (error) return { error: error.message };
    revalidatePath("/dashboard/settings");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
}

export async function deleteThreshold(
  materialId: string
): Promise<void> {
  const { companyId } = await getContext();
  const service = createServiceClient();
  await service
    .from("material_thresholds")
    .delete()
    .eq("company_id", companyId)
    .eq("material_id", materialId);
  revalidatePath("/dashboard/settings");
}
