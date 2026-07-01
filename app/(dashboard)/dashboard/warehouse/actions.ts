"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

export async function setInitialStock(materialId: string, quantity: number) {
  if (!materialId) throw new Error("Не указан материал");
  if (quantity <= 0) throw new Error("Количество должно быть больше нуля");
  if (quantity > 999999999) throw new Error("Количество превышает допустимый предел");

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) throw new Error("Не авторизован");

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", user.id)
    .single();

  if (profileErr) throw new Error(`DB error: ${profileErr.message}`);
  if (!profile?.company_id) throw new Error("Компания не найдена");

  const company_id = profile.company_id as string;

  // Verify material belongs to this company — materialId is client-supplied.
  const { data: material } = await supabase
    .from("materials")
    .select("id")
    .eq("id", materialId)
    .eq("company_id", company_id)
    .maybeSingle();

  if (!material) throw new Error("Материал не найден");

  const today = new Date().toISOString().split("T")[0];

  const { error } = await supabase.from("material_transactions").insert({
    company_id,
    material_id: materialId,
    type: "income",
    quantity,
    note: "Начальный остаток",
    transaction_date: today,
    created_by: user.id,
    source: "manual",
  });

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/warehouse");
  revalidatePath("/dashboard");
}
