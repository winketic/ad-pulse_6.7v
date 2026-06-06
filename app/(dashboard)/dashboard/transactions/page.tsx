import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import TransactionsClient from "@/components/transactions/TransactionsClient";
import type { Transaction, Material } from "@/components/transactions/TransactionsClient";
import type { BalanceData } from "@/components/BalanceCard";
import type { TxType } from "./actions";
import NoCompanyState from "@/components/ui/NoCompanyState";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PAGE_SIZE = 50;

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: { page?: string };
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
  if (!company_id) return <NoCompanyState />;

  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const rangeFrom = (page - 1) * PAGE_SIZE;
  const rangeTo = rangeFrom + PAGE_SIZE - 1;

  const [txResult, countResult, matResult, profilesResult, balanceTxResult] =
    await Promise.all([
      // Paginated list
      supabase
        .from("material_transactions")
        .select(
          "id, type, quantity, note, transaction_date, created_at, material_id, created_by"
        )
        .eq("company_id", company_id)
        .order("transaction_date", { ascending: false })
        .order("created_at", { ascending: false })
        .range(rangeFrom, rangeTo),

      // Total count only (no data, very fast)
      supabase
        .from("material_transactions")
        .select("id", { count: "exact", head: true })
        .eq("company_id", company_id),

      // Materials lookup
      supabase
        .from("materials")
        .select("id, name, unit")
        .eq("company_id", company_id)
        .order("name"),

      // Profiles lookup
      supabase
        .from("profiles")
        .select("id, full_name")
        .eq("company_id", company_id),

      // Lightweight all-tx for balance cards (3 fields only)
      supabase
        .from("material_transactions")
        .select("material_id, type, quantity")
        .eq("company_id", company_id),
    ]);

  const totalCount = countResult.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const matMap = new Map((matResult.data ?? []).map((m) => [m.id, m]));
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
    created_by: tx.created_by ?? "",
    material_name: matMap.get(tx.material_id)?.name ?? "Неизвестный материал",
    material_unit: matMap.get(tx.material_id)?.unit ?? "",
    creator_name: profileMap.get(tx.created_by)?.full_name ?? "—",
  }));

  const materials: Material[] = (matResult.data ?? []).map((m) => ({
    id: m.id,
    name: m.name,
    unit: m.unit,
  }));

  // Compute balances server-side from all transactions
  const balMap = new Map<
    string,
    { material_id: string; name: string; unit: string; balance: number; totalIn: number; totalOut: number }
  >();
  for (const m of matResult.data ?? []) {
    balMap.set(m.id, { material_id: m.id, name: m.name, unit: m.unit, balance: 0, totalIn: 0, totalOut: 0 });
  }
  for (const tx of balanceTxResult.data ?? []) {
    const b = balMap.get(tx.material_id);
    if (!b) continue;
    const qty = Number(tx.quantity);
    if (tx.type === "income" || tx.type === "return") {
      b.totalIn += qty;
      b.balance += qty;
    } else {
      b.totalOut += qty;
      b.balance -= qty;
    }
  }
  const initialBalances: BalanceData[] = Array.from(balMap.values())
    .filter((b) => b.totalIn > 0 || b.totalOut > 0)
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));

  return (
    <TransactionsClient
      transactions={transactions}
      materials={materials}
      initialBalances={initialBalances}
      page={page}
      totalPages={totalPages}
      totalCount={totalCount}
    />
  );
}
