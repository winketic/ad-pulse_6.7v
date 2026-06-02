import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import PlansClient from "@/components/plans/PlansClient";
import type { Plan, PlanMaterial } from "@/components/plans/PlansClient";
import type { PlanStatus } from "./actions";

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
  if (!company_id) return null;

  const [plansResult, matsResult] = await Promise.all([
    supabase
      .from("production_plans")
      .select(
        "id, name, planned_quantity, actual_quantity, start_date, end_date, status, created_at"
      )
      .eq("company_id", company_id)
      .order("created_at", { ascending: false }),
    supabase
      .from("materials")
      .select("id, name, unit")
      .eq("company_id", company_id)
      .order("name"),
  ]);

  const plans: Plan[] = (plansResult.data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    planned_quantity: Number(p.planned_quantity),
    actual_quantity: Number(p.actual_quantity),
    start_date: p.start_date,
    end_date: p.end_date,
    status: p.status as PlanStatus,
    created_at: p.created_at,
  }));

  const materials: PlanMaterial[] = (matsResult.data ?? []).map((m) => ({
    id: m.id,
    name: m.name,
    unit: m.unit,
  }));

  return <PlansClient plans={plans} materials={materials} />;
}
