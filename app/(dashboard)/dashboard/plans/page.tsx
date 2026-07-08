import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import PlansClient from "@/components/plans/PlansClient";
import type { Plan, PlanMaterial, PlanUser } from "@/components/plans/PlansClient";
import type { PlanStatus } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;
import NoCompanyState from "@/components/ui/NoCompanyState";

export default async function PlansPage() {
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
  if (!company_id) return <NoCompanyState />;

  const [plansResult, matsResult, usersResult] = await Promise.all([
    supabase
      .from("production_plans")
      .select(
        "id, name, planned_quantity, actual_quantity, start_date, end_date, status, created_at, assigned_to"
      )
      .eq("company_id", company_id)
      .order("created_at", { ascending: false }),
    supabase
      .from("materials")
      .select("id, name, unit")
      .eq("company_id", company_id)
      .order("name"),
    supabase
      .from("profiles")
      .select("id, full_name")
      .eq("company_id", company_id)
      .order("full_name"),
  ]);

  // Plan line items for the card summary ("2ПБ-16 ×120 · ...")
  const planIds = (plansResult.data ?? []).map((p) => p.id);
  const matNameById = new Map((matsResult.data ?? []).map((m) => [m.id, m.name]));
  const itemsByPlan = new Map<string, { name: string; qty: number }[]>();
  if (planIds.length > 0) {
    const { data: pmRows } = await supabase
      .from("plan_materials")
      .select("plan_id, material_id, planned_quantity")
      .in("plan_id", planIds);
    for (const row of pmRows ?? []) {
      const list = itemsByPlan.get(row.plan_id) ?? [];
      list.push({
        name: matNameById.get(row.material_id) ?? "—",
        qty: Number(row.planned_quantity),
      });
      itemsByPlan.set(row.plan_id, list);
    }
  }

  const plans: Plan[] = (plansResult.data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    planned_quantity: Number(p.planned_quantity),
    actual_quantity: Number(p.actual_quantity),
    start_date: p.start_date,
    end_date: p.end_date,
    status: p.status as PlanStatus,
    created_at: p.created_at,
    assigned_to: p.assigned_to,
    items: itemsByPlan.get(p.id) ?? [],
  }));

  const materials: PlanMaterial[] = (matsResult.data ?? []).map((m) => ({
    id: m.id,
    name: m.name,
    unit: m.unit,
  }));

  const users: PlanUser[] = (usersResult.data ?? []).map((u) => ({
    id: u.id,
    full_name: u.full_name,
  }));

  return <PlansClient plans={plans} materials={materials} users={users} />;
}
