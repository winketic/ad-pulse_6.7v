import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import PlanDetailClient from "@/components/plans/PlanDetailClient";
import type { PlanDetail, PlanMaterialRow } from "@/components/plans/PlanDetailClient";
import type { PlanStatus } from "../actions";

export default async function PlanDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", user.id)
    .single();

  const company_id = profile?.company_id as string | undefined;
  if (!company_id) return null;

  // Plan
  const { data: plan, error: planErr } = await supabase
    .from("production_plans")
    .select(
      "id, name, planned_quantity, actual_quantity, start_date, end_date, status, created_at"
    )
    .eq("id", params.id)
    .eq("company_id", company_id)
    .single();

  if (planErr || !plan) notFound();

  // Plan materials + transactions in plan period (expense + defect)
  const [pmResult, txResult] = await Promise.all([
    supabase
      .from("plan_materials")
      .select("id, material_id, planned_quantity")
      .eq("plan_id", params.id),
    supabase
      .from("material_transactions")
      .select("material_id, type, quantity")
      .eq("company_id", company_id)
      .in("type", ["expense", "defect"])
      .gte("transaction_date", plan.start_date)
      .lte("transaction_date", plan.end_date),
  ]);

  const pmRows = pmResult.data ?? [];
  const materialIds = pmRows.map((r) => r.material_id);

  // Fetch material info
  const matMap = new Map<string, { name: string; unit: string }>();
  if (materialIds.length > 0) {
    const { data: mats } = await supabase
      .from("materials")
      .select("id, name, unit")
      .in("id", materialIds);
    for (const m of mats ?? []) {
      matMap.set(m.id, { name: m.name, unit: m.unit });
    }
  }

  // Actual consumption per material from transactions
  const actualMap = new Map<string, number>();
  for (const tx of txResult.data ?? []) {
    actualMap.set(
      tx.material_id,
      (actualMap.get(tx.material_id) ?? 0) + Number(tx.quantity)
    );
  }

  // Build rows
  const rows: PlanMaterialRow[] = pmRows.map((pm) => {
    const info = matMap.get(pm.material_id);
    const planned = Number(pm.planned_quantity);
    const actual = actualMap.get(pm.material_id) ?? 0;
    const deviation = actual - planned;
    const pct = planned > 0 ? (actual / planned) * 100 : 0;

    return {
      id: pm.id,
      material_id: pm.material_id,
      material_name: info?.name ?? "Неизвестный материал",
      material_unit: info?.unit ?? "",
      planned_quantity: planned,
      actual_quantity: actual,
      deviation,
      pct,
    };
  });

  const detail: PlanDetail = {
    id: plan.id,
    name: plan.name,
    planned_quantity: Number(plan.planned_quantity),
    actual_quantity: Number(plan.actual_quantity),
    start_date: plan.start_date,
    end_date: plan.end_date,
    status: plan.status as PlanStatus,
    created_at: plan.created_at,
    materials: rows,
  };

  return <PlanDetailClient plan={detail} />;
}
