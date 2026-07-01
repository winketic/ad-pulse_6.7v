import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import NoCompanyState from "@/components/ui/NoCompanyState";
import WarehouseClient from "@/components/warehouse/WarehouseClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type WarehouseMaterial = {
  id: string;
  name: string;
  unit: string;
  balance: number;
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

  const [matsResult, txResult] = await Promise.all([
    supabase
      .from("materials")
      .select("id, name, unit")
      .eq("company_id", company_id)
      .order("name"),
    supabase
      .from("material_transactions")
      .select("material_id, type, quantity")
      .eq("company_id", company_id),
  ]);

  const balMap = new Map<string, number>();
  for (const mat of matsResult.data ?? []) balMap.set(mat.id, 0);

  for (const tx of txResult.data ?? []) {
    const prev = balMap.get(tx.material_id) ?? 0;
    const qty = Number(tx.quantity);
    const delta =
      tx.type === "income" || tx.type === "return" ? qty : -qty;
    balMap.set(tx.material_id, prev + delta);
  }

  const materials: WarehouseMaterial[] = (matsResult.data ?? []).map((m) => ({
    id: m.id,
    name: m.name,
    unit: m.unit,
    balance: balMap.get(m.id) ?? 0,
  }));

  return <WarehouseClient materials={materials} />;
}
