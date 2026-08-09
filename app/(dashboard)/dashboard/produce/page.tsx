import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import ProduceClient, { type ProduceMaterial } from "@/components/produce/ProduceClient";
import NoCompanyState from "@/components/ui/NoCompanyState";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProducePage() {
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

  // All company materials. Products = everything that isn't a raw material.
  // Raw = "Бетон" + whatever is referenced as a rebar target (Арматура/Проволока).
  // Products include category-Б перемычки that have NO norms yet — they can still
  // be produced (штука only, no auto-deduction).
  const { data: allMats } = await supabase
    .from("materials")
    .select("id, name, unit, norm_concrete, norm_rebar, rebar_material_name")
    .eq("company_id", company_id)
    .order("name");

  const rawNames = new Set<string>(["Бетон"]);
  for (const m of allMats ?? []) {
    if (m.rebar_material_name) rawNames.add(m.rebar_material_name as string);
  }
  const rawMats = (allMats ?? []).filter((m) => !rawNames.has(m.name));

  if (!rawMats || rawMats.length === 0) {
    return (
      <div className="p-4 sm:p-6 max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[var(--text)]">Быстрый выпуск</h1>
        </div>
        <div className="flex flex-col items-center justify-center py-20 text-center bg-[var(--card)] rounded-xl border border-[var(--border)]">
          <div className="w-14 h-14 rounded-2xl bg-[var(--bg3)] flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-[var(--muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-[var(--text)] mb-1">Нет производственных материалов</p>
          <p className="text-xs text-[var(--muted)] mb-4">
            Укажите нормы расхода бетона и арматуры в карточке материала
          </p>
          <Link
            href="/dashboard/materials"
            className="dp-btn-primary rounded-xl"
          >
            Открыть справочник
          </Link>
        </div>
      </div>
    );
  }

  const matIds = rawMats.map((m) => m.id);

  // Fetch usage frequency for last 14 days (income transactions = finished products)
  const since = new Date();
  since.setDate(since.getDate() - 14);
  const sinceStr = since.toISOString().split("T")[0];

  const rawList = (allMats ?? []).filter((m) => rawNames.has(m.name));
  const rawIds = rawList.map((m) => m.id);

  const [{ data: freqRows }, { data: rawTx }] = await Promise.all([
    supabase
      .from("material_transactions")
      .select("material_id, quantity")
      .eq("company_id", company_id)
      .is("deleted_at", null)
      .eq("type", "income")
      .in("material_id", matIds)
      .gte("transaction_date", sinceStr),
    // Raw stock balances (concrete + each rebar target) for the cart's soft check
    rawIds.length > 0
      ? supabase
          .from("material_transactions")
          .select("material_id, type, quantity")
          .eq("company_id", company_id)
          .is("deleted_at", null)
          .in("material_id", rawIds)
      : Promise.resolve({ data: [] as { material_id: string; type: string; quantity: number }[] }),
  ]);

  // Aggregate frequency counts
  const freqMap = new Map<string, number>();
  for (const row of freqRows ?? []) {
    freqMap.set(row.material_id, (freqMap.get(row.material_id) ?? 0) + Number(row.quantity));
  }

  // Raw balances by material id → then by name
  const balById = new Map<string, number>();
  for (const t of rawTx ?? []) {
    const q = Number(t.quantity);
    const delta = t.type === "income" || t.type === "return" ? q : -q;
    balById.set(t.material_id, (balById.get(t.material_id) ?? 0) + delta);
  }

  const rawStock = rawList.map((m) => ({
    name: m.name,
    unit: m.unit,
    balance: balById.get(m.id) ?? 0,
  }));
  const rebarUnitByName = new Map(rawList.map((m) => [m.name, m.unit]));
  const concreteUnit = rebarUnitByName.get("Бетон") ?? "м³";

  const materials: ProduceMaterial[] = rawMats
    .map((m) => {
      const rebarName =
        ((m as Record<string, unknown>).rebar_material_name as string | null) ?? "Арматура";
      return {
        id: m.id,
        name: m.name,
        unit: m.unit,
        norm_concrete: m.norm_concrete == null ? null : Number(m.norm_concrete),
        norm_rebar: m.norm_rebar == null ? null : Number(m.norm_rebar),
        rebar_material_name: rebarName,
        concrete_unit: concreteUnit,
        rebar_unit: rebarUnitByName.get(rebarName) ?? "кг",
        freq14d: freqMap.get(m.id) ?? 0,
      };
    })
    // Sort by 14-day usage descending, then alphabetically (numeric-aware)
    .sort((a, b) => b.freq14d - a.freq14d || a.name.localeCompare(b.name, "ru", { numeric: true }));

  return <ProduceClient materials={materials} rawStock={rawStock} />;
}
