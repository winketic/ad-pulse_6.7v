import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import NoCompanyState from "@/components/ui/NoCompanyState";
import WarehouseClient from "@/components/warehouse/WarehouseClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type WarehouseTx = {
  date: string;
  type: string;
  qty: number;
};

export type WarehouseMaterial = {
  id: string;
  name: string;
  unit: string;
  balance: number;
  threshold: number | null;
  // Finished product (перемычка, has both consumption norms) vs raw
  // material (Бетон/Арматура/Проволока…). Stock-level warnings apply
  // only to raw materials — a product at 0 is normal, not critical.
  isProduct: boolean;
  recent: WarehouseTx[];
  // Net movement per day, last 7 days oldest→newest — desktop sparkline
  week: number[];
};

export default async function WarehousePage() {
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

  const [matsResult, txResult, thresholdsResult] = await Promise.all([
    // select("*") — survives not-yet-applied schema migrations
    supabase
      .from("materials")
      .select("*")
      .eq("company_id", company_id)
      .order("name"),
    supabase
      .from("material_transactions")
      .select("material_id, type, quantity, transaction_date, created_at")
      .eq("company_id", company_id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("material_thresholds")
      .select("material_id, min_quantity")
      .eq("company_id", company_id),
  ]);

  const thresholdMap = new Map<string, number>();
  for (const t of thresholdsResult.data ?? []) {
    thresholdMap.set(t.material_id, Number(t.min_quantity));
  }

  const balMap = new Map<string, number>();
  for (const mat of matsResult.data ?? []) balMap.set(mat.id, 0);

  for (const tx of txResult.data ?? []) {
    const prev = balMap.get(tx.material_id) ?? 0;
    const qty = Number(tx.quantity);
    const delta =
      tx.type === "income" || tx.type === "return" ? qty : -qty;
    balMap.set(tx.material_id, prev + delta);
  }

  // Last 5 movements per material (txResult is already newest-first)
  const recentMap = new Map<string, WarehouseTx[]>();
  for (const tx of txResult.data ?? []) {
    const list = recentMap.get(tx.material_id) ?? [];
    if (list.length < 5) {
      list.push({
        date: (tx.transaction_date as string) ?? (tx.created_at as string).split("T")[0],
        type: tx.type,
        qty: Number(tx.quantity),
      });
      recentMap.set(tx.material_id, list);
    }
  }

  // Daily net deltas for the last 7 days (per material)
  const weekDays: string[] = Array.from({ length: 7 }, (_, i) =>
    new Date(Date.now() - (6 - i) * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
  );
  const dayIndex = new Map(weekDays.map((d, i) => [d, i]));
  const weekMap = new Map<string, number[]>();
  for (const tx of txResult.data ?? []) {
    const d = (tx.transaction_date as string) ?? (tx.created_at as string).split("T")[0];
    const idx = dayIndex.get(d);
    if (idx == null) continue;
    const series = weekMap.get(tx.material_id) ?? Array(7).fill(0);
    const qty = Number(tx.quantity);
    series[idx] += tx.type === "income" || tx.type === "return" ? qty : -qty;
    weekMap.set(tx.material_id, series);
  }

  const materials: WarehouseMaterial[] = (matsResult.data ?? []).map((m) => {
    const raw = m as Record<string, unknown>;
    return {
      id: m.id,
      name: m.name,
      unit: m.unit,
      balance: balMap.get(m.id) ?? 0,
      threshold: thresholdMap.get(m.id) ?? null,
      isProduct: raw.norm_concrete != null && raw.norm_rebar != null,
      recent: recentMap.get(m.id) ?? [],
      week: weekMap.get(m.id) ?? Array(7).fill(0),
    };
  });

  return <WarehouseClient materials={materials} />;
}
