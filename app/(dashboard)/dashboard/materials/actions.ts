"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

export type MaterialInput = {
  name: string;
  unit: string;
  gost_norm: number | null;
};

async function getSupabaseAndCompany() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Не авторизован");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", user.id)
    .single();

  if (profileError) throw new Error(`DB error: ${profileError.message}`);
  if (!profile?.company_id) throw new Error("Компания не найдена");

  return { supabase, company_id: profile.company_id as string };
}

export async function createMaterial(input: MaterialInput) {
  const { supabase, company_id } = await getSupabaseAndCompany();

  const { error } = await supabase.from("materials").insert({
    company_id,
    name: input.name.trim(),
    unit: input.unit,
    gost_norm: input.gost_norm,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/materials");
}

export async function updateMaterial(id: string, input: MaterialInput) {
  const { supabase, company_id } = await getSupabaseAndCompany();

  const { error } = await supabase
    .from("materials")
    .update({
      name: input.name.trim(),
      unit: input.unit,
      gost_norm: input.gost_norm,
    })
    .eq("id", id)
    .eq("company_id", company_id);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/materials");
}

export async function deleteMaterial(id: string) {
  const { supabase, company_id } = await getSupabaseAndCompany();

  const { error } = await supabase
    .from("materials")
    .delete()
    .eq("id", id)
    .eq("company_id", company_id);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/materials");
}
