import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import ReportsClient from "@/components/reports/ReportsClient";
import type { SummaryRow, DefectRow, AllTxRow } from "@/components/reports/ReportsClient";
import NoCompanyState from "@/components/ui/NoCompanyState";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string };
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

  // ── Default: last 30 days ────────────────────────────────
  const todayDate = new Date();
  const defaultTo = todayDate.toISOString().split("T")[0];
  const defaultFrom = new Date(todayDate.getTime() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const from = searchParams.from ?? defaultFrom;
  const to = searchParams.to ?? defaultTo;

  // ── All 3 queries in parallel — no waterfall ─────────────
  const [matsResult, txResult, profilesResult] = await Promise.all([
    supabase
      .from("materials")
      .select("id, name, unit")
      .eq("company_id", company_id)
      .order("name"),
    supabase
      .from("material_transactions")
      .select("id, material_id, type, quantity, note, counterparty, transaction_date, created_by")
      .eq("company_id", company_id)
      .gte("transaction_date", from)
      .lte("transaction_date", to)
      .order("transaction_date", { ascending: false }),
    // Fetch all company profiles upfront — avoids sequential fetch after defect filter
    supabase
      .from("profiles")
      .select("id, full_name")
      .eq("company_id", company_id),
  ]);

  const materials = matsResult.data ?? [];
  const txs = txResult.data ?? [];

  // ── Build profile map ────────────────────────────────────
  const defectTxs = txs.filter((t) => t.type === "defect");
  const profileMap = new Map<string, string>();
  for (const p of profilesResult.data ?? []) {
    profileMap.set(p.id, p.full_name ?? "—");
  }

  // ── Material lookup map ───────────────────────────────────
  const matMap = new Map(materials.map((m) => [m.id, m]));

  // ── Build summary rows ────────────────────────────────────
  type Agg = { income: number; return_qty: number; expense: number; defect: number };

  const aggMap = new Map<string, Agg>();

  for (const mat of materials) {
    aggMap.set(mat.id, { income: 0, return_qty: 0, expense: 0, defect: 0 });
  }

  for (const tx of txs) {
    const agg = aggMap.get(tx.material_id);
    if (!agg) continue;
    const qty = Number(tx.quantity);
    if (tx.type === "income") agg.income += qty;
    else if (tx.type === "return") agg.return_qty += qty;
    else if (tx.type === "expense") agg.expense += qty;
    else if (tx.type === "defect") agg.defect += qty;
  }

  const summary: SummaryRow[] = materials
    .map((mat) => {
      const a = aggMap.get(mat.id) ?? {
        income: 0,
        return_qty: 0,
        expense: 0,
        defect: 0,
      };
      return {
        material_id: mat.id,
        material_name: mat.name,
        unit: mat.unit,
        income: a.income,
        return_qty: a.return_qty,
        expense: a.expense,
        defect: a.defect,
        balance: a.income + a.return_qty - a.expense - a.defect,
      };
    })
    // Only include materials with activity in this period
    .filter(
      (r) =>
        r.income > 0 ||
        r.return_qty > 0 ||
        r.expense > 0 ||
        r.defect > 0
    );

  // ── Build defect rows ─────────────────────────────────────
  const defects: DefectRow[] = defectTxs.map((tx) => {
    const mat = matMap.get(tx.material_id);
    return {
      id: tx.id,
      transaction_date: tx.transaction_date ?? "",
      material_name: mat?.name ?? "—",
      material_unit: mat?.unit ?? "",
      quantity: Number(tx.quantity),
      note: tx.note ?? null,
      creator_name: profileMap.get(tx.created_by) ?? "—",
    };
  });

  // ── Build all-transactions rows (for Sheet 3 Excel export) ───
  const allTransactions: AllTxRow[] = txs.map((tx) => {
    const mat = matMap.get(tx.material_id);
    return {
      id: tx.id,
      transaction_date: tx.transaction_date ?? "",
      type: tx.type,
      material_name: mat?.name ?? "—",
      material_unit: mat?.unit ?? "",
      quantity: Number(tx.quantity),
      note: tx.note ?? null,
      counterparty: (tx as Record<string, unknown>).counterparty as string | null ?? null,
      creator_name: profileMap.get(tx.created_by) ?? "—",
    };
  });

  return (
    <ReportsClient
      summary={summary}
      defects={defects}
      allTransactions={allTransactions}
      from={from}
      to={to}
    />
  );
}
