"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

export type PlanStatus = "active" | "completed" | "cancelled";

export type PlanMaterialInput = {
  material_id: string;
  planned_quantity: number;
};

export type CreatePlanInput = {
  name: string;
  start_date: string;
  end_date: string;
  materials: PlanMaterialInput[];
};

async function getCtx() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Не авторизован");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", user.id)
    .single();

  if (profileError) throw new Error(`DB error: ${profileError.message}`);
  if (!profile?.company_id) throw new Error("Компания не найдена");

  return { supabase, user, company_id: profile.company_id as string };
}

export async function createPlan(input: CreatePlanInput): Promise<string> {
  const { supabase, user, company_id } = await getCtx();

  if (!input.name.trim()) throw new Error("Укажите название плана");
  if (!input.start_date || !input.end_date)
    throw new Error("Укажите период плана");
  if (input.end_date < input.start_date)
    throw new Error("Дата окончания не может быть раньше даты начала");
  if (input.materials.length === 0)
    throw new Error("Добавьте хотя бы один материал");

  const uniqueIds = new Set(input.materials.map((m) => m.material_id));
  if (uniqueIds.size !== input.materials.length)
    throw new Error("Один и тот же материал указан несколько раз");

  const planned_quantity = input.materials.reduce(
    (s, m) => s + m.planned_quantity,
    0
  );

  const { data: plan, error: planErr } = await supabase
    .from("production_plans")
    .insert({
      company_id,
      name: input.name.trim(),
      planned_quantity,
      start_date: input.start_date,
      end_date: input.end_date,
      status: "active",
      created_by: user.id,
    })
    .select("id")
    .single();

  if (planErr || !plan) throw new Error(planErr?.message ?? "Ошибка создания");

  const { error: matErr } = await supabase.from("plan_materials").insert(
    input.materials.map((m) => ({
      plan_id: plan.id,
      material_id: m.material_id,
      planned_quantity: m.planned_quantity,
    }))
  );

  if (matErr) throw new Error(matErr.message);

  revalidatePath("/dashboard/plans");
  return plan.id;
}

export async function updatePlanStatus(id: string, status: PlanStatus) {
  const { supabase, company_id } = await getCtx();

  const { error } = await supabase
    .from("production_plans")
    .update({ status })
    .eq("id", id)
    .eq("company_id", company_id);

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/plans");
  revalidatePath(`/dashboard/plans/${id}`);
}
