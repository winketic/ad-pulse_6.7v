import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import ReportsClient from "@/components/reports/ReportsClient";
import type {
  SummaryRow,
  DefectRow,
  AllTxRow,
  CounterpartyRow,
  ProductionRow,
} from "@/components/reports/ReportsClient";
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
      .is("deleted_at", null)
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

  // ── By counterparty ──────────────────────────────────────
  // приход = income + return, расход = expense + defect, grouped by
  // counterparty (empty → "Без контрагента"), with per-material income.
  type CpAgg = {
    incomeTotal: number;
    expenseTotal: number;
    byMaterial: Map<string, { unit: string; income: number; expense: number }>;
  };
  const cpMap = new Map<string, CpAgg>();
  for (const tx of txs) {
    const cp = (tx.counterparty as string | null)?.trim() || "Без контрагента";
    let agg = cpMap.get(cp);
    if (!agg) {
      agg = { incomeTotal: 0, expenseTotal: 0, byMaterial: new Map() };
      cpMap.set(cp, agg);
    }
    const mat = matMap.get(tx.material_id);
    const key = mat?.name ?? "—";
    let m = agg.byMaterial.get(key);
    if (!m) {
      m = { unit: mat?.unit ?? "", income: 0, expense: 0 };
      agg.byMaterial.set(key, m);
    }
    const qty = Number(tx.quantity);
    if (tx.type === "income" || tx.type === "return") {
      agg.incomeTotal += qty;
      m.income += qty;
    } else {
      agg.expenseTotal += qty;
      m.expense += qty;
    }
  }
  const byCounterparty: CounterpartyRow[] = Array.from(cpMap.entries())
    .map(([counterparty, agg]) => ({
      counterparty,
      incomeTotal: agg.incomeTotal,
      expenseTotal: agg.expenseTotal,
      materials: Array.from(agg.byMaterial.entries())
        .map(([material_name, mm]) => ({ material_name, ...mm }))
        .filter((mm) => mm.income > 0 || mm.expense > 0)
        .sort((a, b) => b.income - a.income),
    }))
    // "Без контрагента" always last; others by total volume
    .sort((a, b) => {
      if (a.counterparty === "Без контрагента") return 1;
      if (b.counterparty === "Без контрагента") return -1;
      return b.incomeTotal + b.expenseTotal - (a.incomeTotal + a.expenseTotal);
    });

  // ── Production ────────────────────────────────────────────
  // The production RPC tags all 3 rows with note `Производство: <name> <qty> шт`.
  // income row = lintel produced; expense rows = concrete/rebar consumed. We
  // link concrete/rebar to a lintel by parsing the name out of the note.
  const parseLintel = (note: string | null): string | null => {
    if (!note) return null;
    const m = note.match(/^Производство:\s+(.+)\s+[\d.,]+\s+шт$/);
    return m ? m[1].trim() : null;
  };
  type ProdAgg = { unit: string; produced: number; concrete: number; rebar: number };
  const prodMap = new Map<string, ProdAgg>();
  let concreteUnit = "м³";
  let rebarUnit = "м";
  for (const tx of txs) {
    const note = tx.note as string | null;
    if (!note?.startsWith("Производство:")) continue;
    const lintel = parseLintel(note);
    if (!lintel) continue;
    const mat = matMap.get(tx.material_id);
    let agg = prodMap.get(lintel);
    if (!agg) {
      agg = { unit: "шт", produced: 0, concrete: 0, rebar: 0 };
      prodMap.set(lintel, agg);
    }
    const qty = Number(tx.quantity);
    if (tx.type === "income") {
      agg.unit = mat?.unit ?? "шт";
      agg.produced += qty;
    } else if (tx.type === "expense") {
      if (mat?.name === "Бетон") {
        agg.concrete += qty;
        concreteUnit = mat?.unit ?? concreteUnit;
      } else {
        agg.rebar += qty;
        rebarUnit = mat?.unit ?? rebarUnit;
      }
    }
  }
  const production: ProductionRow[] = Array.from(prodMap.entries())
    .map(([lintel_name, agg]) => ({ lintel_name, ...agg }))
    .filter((r) => r.produced > 0)
    .sort((a, b) => b.produced - a.produced);

  return (
    <ReportsClient
      summary={summary}
      defects={defects}
      allTransactions={allTransactions}
      byCounterparty={byCounterparty}
      production={production}
      concreteUnit={concreteUnit}
      rebarUnit={rebarUnit}
      from={from}
      to={to}
    />
  );
}
