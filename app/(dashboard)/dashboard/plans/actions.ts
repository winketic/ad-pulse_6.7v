"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { sendTelegramAlert } from "@/lib/telegram/send";
import { canManagePlans } from "@/lib/auth/role-permissions";

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
  assigned_to?: string | null;
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
    .select("company_id, role")
    .eq("id", user.id)
    .single();

  if (profileError) throw new Error(`DB error: ${profileError.message}`);
  if (!profile?.company_id) throw new Error("Компания не найдена");

  return { supabase, user, company_id: profile.company_id as string, role: profile.role as string };
}

// PostgREST PGRST202 — функции нет в schema cache; PostgreSQL 42883 —
// undefined_function. Оба означают «053 ещё не применена», а не сбой данных.
const RPC_MISSING_CODES = new Set(["PGRST202", "42883"]);

export async function createPlan(input: CreatePlanInput): Promise<string> {
  const { supabase, user, company_id, role } = await getCtx();
  if (!canManagePlans(role)) throw new Error("Нет прав для создания планов");

  if (typeof input.name !== "string" || !input.name.trim()) throw new Error("Укажите название плана");
  if (!input.start_date || !input.end_date)
    throw new Error("Укажите период плана");
  if (input.end_date < input.start_date)
    throw new Error("Дата окончания не может быть раньше даты начала");
  if (input.materials.length === 0)
    throw new Error("Добавьте хотя бы один материал");

  const uniqueIds = new Set(input.materials.map((m) => m.material_id));
  if (uniqueIds.size !== input.materials.length)
    throw new Error("Один и тот же материал указан несколько раз");
  if (input.materials.some((m) => !Number.isFinite(m.planned_quantity) || m.planned_quantity <= 0))
    throw new Error("Количество материала должно быть больше нуля");

  const { data: ownMaterials, error: materialsError } = await supabase
    .from("materials")
    .select("id")
    .eq("company_id", company_id)
    .in("id", Array.from(uniqueIds));
  if (materialsError) throw new Error(`DB error: ${materialsError.message}`);
  if ((ownMaterials ?? []).length !== uniqueIds.size) {
    throw new Error("Один или несколько материалов не найдены в вашей компании");
  }

  const assigned_to = input.assigned_to || null;

  if (assigned_to) {
    // assigned_to is client-supplied — verify it's a profile in this
    // company before trusting it (production_plans' FK only checks the
    // row exists in profiles *somewhere*, not that it's the same company).
    const { data: assignee } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", assigned_to)
      .eq("company_id", company_id)
      .maybeSingle();

    if (!assignee) throw new Error("Исполнитель не найден в вашей компании");
  }

  const planned_quantity = input.materials.reduce(
    (s, m) => s + m.planned_quantity,
    0
  );

  // План и его материалы создаются одной транзакцией внутри
  // public.create_production_plan_with_materials (миграция 053): сбой на
  // материалах откатывает и сам план, поэтому план-сирота невозможен.
  const { data: rpcPlanId, error: rpcErr } = await supabase.rpc(
    "create_production_plan_with_materials",
    {
      p_company_id: company_id,
      p_name: input.name.trim(),
      p_start_date: input.start_date,
      p_end_date: input.end_date,
      p_status: "active",
      p_created_by: user.id,
      p_assigned_to: assigned_to,
      p_materials: input.materials.map((m) => ({
        material_id: m.material_id,
        planned_quantity: m.planned_quantity,
      })),
    }
  );

  let planId: string;

  if (rpcErr) {
    if (!RPC_MISSING_CODES.has(rpcErr.code ?? "")) {
      // Функция есть, но отклонила операцию (RLS/проверки/БД) — ничего не
      // создано, транзакция уже откатилась.
      throw new Error(rpcErr.message);
    }

    // Миграция 053 ещё не применена (PGRST202 — функции нет в схеме,
    // 42883 — undefined_function). Работаем по старой двухшаговой схеме,
    // но с компенсирующим удалением осиротевшего плана.
    planId = await createPlanLegacy({
      supabase,
      company_id,
      created_by: user.id,
      name: input.name.trim(),
      start_date: input.start_date,
      end_date: input.end_date,
      planned_quantity,
      assigned_to,
      materials: input.materials,
    });
  } else if (typeof rpcPlanId === "string" && rpcPlanId) {
    planId = rpcPlanId;
  } else {
    throw new Error("Не удалось создать план");
  }

  revalidatePath("/dashboard/plans");

  // Уведомление — только после успешного создания плана вместе с материалами.
  void notifyPlanCreated({
    supabase,
    company_id,
    name: input.name.trim(),
    endDate: input.end_date,
    materials: input.materials,
    assigned_to,
  }).catch((e) => console.error("[createPlan] telegram notify error:", e));

  return planId;
}

type LegacyCreatePlanArgs = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  company_id: string;
  created_by: string;
  name: string;
  start_date: string;
  end_date: string;
  planned_quantity: number;
  assigned_to: string | null;
  materials: PlanMaterialInput[];
};

/**
 * Fallback на время окна ДО применения миграции 053: два отдельных INSERT.
 * Атомарности нет, поэтому при ошибке вставки материалов созданный план
 * удаляется компенсирующим DELETE. Если и удаление не удалось, факт
 * осиротевшего плана попадает в лог, а не теряется молча.
 */
async function createPlanLegacy({
  supabase,
  company_id,
  created_by,
  name,
  start_date,
  end_date,
  planned_quantity,
  assigned_to,
  materials,
}: LegacyCreatePlanArgs): Promise<string> {
  const { data: plan, error: planErr } = await supabase
    .from("production_plans")
    .insert({
      company_id,
      name,
      planned_quantity,
      start_date,
      end_date,
      status: "active",
      created_by,
      assigned_to,
    })
    .select("id")
    .single();

  if (planErr || !plan) throw new Error(planErr?.message ?? "Ошибка создания");

  const planId = plan.id as string;

  const { error: matErr } = await supabase.from("plan_materials").insert(
    materials.map((m) => ({
      plan_id: planId,
      material_id: m.material_id,
      planned_quantity: m.planned_quantity,
    }))
  );

  if (!matErr) return planId;

  const { data: removedRows, error: deleteErr } = await supabase
    .from("production_plans")
    .delete()
    .eq("id", planId)
    .eq("company_id", company_id)
    .select("id");

  if (deleteErr) {
    console.error(
      "[createPlan] компенсирующее удаление плана не удалось:",
      { plan_id: planId, error: deleteErr.message }
    );
  } else if (!removedRows || removedRows.length === 0) {
    // RLS на DELETE production_plans разрешает удаление только admin:
    // у manager строка отфильтруется без ошибки — фиксируем это в логе.
    console.error(
      "[createPlan] компенсирующее удаление не удалило ни одной строки (RLS?):",
      { plan_id: planId }
    );
  }

  throw new Error(matErr.message);
}

async function notifyPlanCreated({
  supabase,
  company_id,
  name,
  endDate,
  materials,
  assigned_to,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  company_id: string;
  name: string;
  endDate: string;
  materials: PlanMaterialInput[];
  assigned_to: string | null;
}) {
  const { data: rows, error } = await supabase
    .from("materials")
    .select("id, name")
    .eq("company_id", company_id)
    .in("id", materials.map((m) => m.material_id));

  if (error) throw new Error(`DB error: ${error.message}`);

  const nameById = new Map((rows ?? []).map((r) => [r.id, r.name]));

  const [y, m, d] = endDate.split("-");
  const formattedDate = `${d}.${m}.${y}`;

  const lines = materials
    .map((mi) => `- ${nameById.get(mi.material_id) ?? "?"} ${mi.planned_quantity} шт`)
    .join("\n");

  await sendTelegramAlert(
    company_id,
    `📋 <b>Новый производственный план</b>\n\n` +
      `До ${formattedDate} нужно произвести:\n${lines}`
  );

  // This is a plain informational notice — no per-user accept/decline,
  // matches the existing one-shared-chat-per-company Telegram model.
  if (assigned_to) {
    await sendTelegramAlert(
      company_id,
      `📋 <b>Вам назначен производственный план:</b> ${name}\n` +
        `До ${formattedDate}`
    );
  }
}

export async function updatePlanStatus(id: string, status: PlanStatus) {
  const { supabase, company_id, role } = await getCtx();
  if (!canManagePlans(role)) throw new Error("Нет прав для изменения планов");
  if (!["active", "completed", "cancelled"].includes(status)) throw new Error("Неизвестный статус плана");

  const { error } = await supabase
    .from("production_plans")
    .update({ status })
    .eq("id", id)
    .eq("company_id", company_id);

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/plans");
  revalidatePath(`/dashboard/plans/${id}`);
}
