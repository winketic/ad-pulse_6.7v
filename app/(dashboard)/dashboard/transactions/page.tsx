import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import TransactionsClient from "@/components/transactions/TransactionsClient";
import type { Transaction, Material } from "@/components/transactions/TransactionsClient";
import type { TxType } from "./actions";
import NoCompanyState from "@/components/ui/NoCompanyState";

export default async function TransactionsPage() {
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

  const [txResult, matResult, profilesResult] = await Promise.all([
    supabase
      .from("material_transactions")
      .select(
        "id, type, quantity, note, transaction_date, created_at, material_id, created_by"
      )
      .eq("company_id", company_id)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("materials")
      .select("id, name, unit")
      .eq("company_id", company_id)
      .order("name"),
    supabase
      .from("profiles")
      .select("id, full_name")
      .eq("company_id", company_id),
  ]);

  const matMap = new Map(
    (matResult.data ?? []).map((m) => [m.id, m])
  );
  const profileMap = new Map(
    (profilesResult.data ?? []).map((p) => [p.id, p])
  );

  const transactions: Transaction[] = (txResult.data ?? []).map((tx) => ({
    id: tx.id,
    type: tx.type as TxType,
    quantity: Number(tx.quantity),
    note: tx.note ?? null,
    transaction_date:
      tx.transaction_date ?? (tx.created_at as string).split("T")[0],
    created_at: tx.created_at,
    material_id: tx.material_id,
    created_by: tx.created_by,
    material_name: matMap.get(tx.material_id)?.name ?? "Неизвестный материал",
    material_unit: matMap.get(tx.material_id)?.unit ?? "",
    creator_name:
      profileMap.get(tx.created_by)?.full_name ?? "Неизвестно",
  }));

  const materials: Material[] = (matResult.data ?? []).map((m) => ({
    id: m.id,
    name: m.name,
    unit: m.unit,
  }));

  return <TransactionsClient transactions={transactions} materials={materials} />;
}
