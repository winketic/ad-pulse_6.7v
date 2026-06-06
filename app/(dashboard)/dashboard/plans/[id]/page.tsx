import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import PlanDetailClient from "@/components/plans/PlanDetailClient";
import type { PlanDetail, PlanMaterialRow } from "@/components/plans/PlanDetailClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;
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
  if (!company_id) {
    return (
      <div className="p-6 text-center text-sm text-gray-400">
        Компания не найдена. Обратитесь к администратору.
      </div>
    );
  }

  // Batch 1: plan header + plan_materials with embedded materials join (parallel)
  const [planResult, pmResult] = await Promise.all([
    supabase
      .from("production_plans")
      .select(
        "id, name, planned_quantity, actual_quantity, start_date, end_date, status, created_at"
      )
      .eq("id", params.id)
      .eq("company_id", company_id)
      .single(),

    // Single query: plan_materials joined with materials — no separate lookup needed
    supabase
      .from("plan_materials")
      .select("id, material_id, planned_quantity, materials(name, unit)")
      .eq("plan_id", params.id),
  ]);

  if (planResult.error || !planResult.data) notFound();
  const plan = planResult.data;

  // Batch 2: transactions in plan period (needs plan dates from batch 1)
  const { data: txData } = await supabase
    .from("material_transactions")
    .select("material_id, type, quantity")
    .eq("company_id", company_id)
    .in("type", ["expense", "defect"])
    .gte("transaction_date", plan.start_date)
    .lte("transaction_date", plan.end_date);

  // Actual consumption per material
  const actualMap = new Map<string, number>();
  for (const tx of txData ?? []) {
    actualMap.set(
      tx.material_id,
      (actualMap.get(tx.material_id) ?? 0) + Number(tx.quantity)
    );
  }

  type PmRow = {
    id: string;
    material_id: string;
    planned_quantity: number;
    materials: { name: string; unit: string } | null;
  };

  const rows: PlanMaterialRow[] = ((pmResult.data ?? []) as unknown as PmRow[]).map(
    (pm) => {
      const planned = Number(pm.planned_quantity);
      const actual = actualMap.get(pm.material_id) ?? 0;
      const deviation = actual - planned;
      const pct = planned > 0 ? (actual / planned) * 100 : 0;

      return {
        id: pm.id,
        material_id: pm.material_id,
        material_name: pm.materials?.name ?? "Неизвестный материал",
        material_unit: pm.materials?.unit ?? "",
        planned_quantity: planned,
        actual_quantity: actual,
        deviation,
        pct,
      };
    }
  );

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
