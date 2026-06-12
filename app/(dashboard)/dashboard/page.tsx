import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import NoCompanyState from "@/components/ui/NoCompanyState";
import { formatCompact } from "@/lib/utils/format";
import { BalanceTableRealtime } from "@/components/dashboard/BalanceTableRealtime";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// ─── Type helpers ─────────────────────────────────────────

type TxType = "income" | "expense" | "return" | "defect";

const TYPE_LABELS: Record<TxType, string> = {
  income: "Приход",
  expense: "Расход",
  return: "Возврат",
  defect: "Брак",
};

const TYPE_COLORS: Record<TxType, { bg: string; text: string }> = {
  income: { bg: "bg-green-100", text: "text-green-700" },
  expense: { bg: "bg-red-100", text: "text-red-700" },
  return: { bg: "bg-blue-100", text: "text-blue-700" },
  defect: { bg: "bg-amber-100", text: "text-amber-700" },
};

function fmtDate(s: string) {
  const [y, m, d] = s.split("-");
  return `${d}.${m}.${y}`;
}

// ─── Sub-components ───────────────────────────────────────

function StatCard({
  label,
  mobileLabel,
  value,
  sub,
  valueColor = "text-[var(--text)]",
  iconBg,
  iconColor,
  icon,
}: {
  label: string;
  mobileLabel?: string;
  value: string | number;
  sub: string;
  valueColor?: string;
  iconBg: string;
  iconColor: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-[var(--card)] rounded-xl border border-[var(--border)]">
      {/* Mobile: compact, no icon */}
      <div className="sm:hidden p-4">
        <p className="text-xs text-[var(--muted)] mb-1">{mobileLabel ?? label}</p>
        <p className={`text-2xl font-bold tabular-nums ${valueColor}`}>{value}</p>
        <p className="text-xs text-[var(--muted)] mt-0.5">{sub}</p>
      </div>
      {/* Desktop: icon + text */}
      <div className="hidden sm:flex p-5 items-start gap-4">
        <div className={`flex items-center justify-center w-11 h-11 rounded-xl shrink-0 ${iconBg} ${iconColor}`}>
          {icon}
        </div>
        <div className="min-w-0 overflow-hidden">
          <p className="text-sm text-[var(--muted)] leading-tight truncate">{label}</p>
          <p className={`text-2xl font-bold mt-0.5 tabular-nums ${valueColor}`}>{value}</p>
          <p className="text-xs text-[var(--muted)] mt-0.5">{sub}</p>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  href,
  linkLabel,
}: {
  title: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-sm font-semibold text-[var(--text)]">{title}</h2>
      {href && (
        <Link
          href={href}
          className="text-xs text-[#00f5c4] hover:underline font-medium"
        >
          {linkLabel ?? "Смотреть все →"}
        </Link>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id, full_name")
    .eq("id", user.id)
    .single();

  const company_id = profile?.company_id as string | undefined;
  if (!company_id) return <NoCompanyState />;

  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  // ── All 6 queries in parallel — no waterfall ───────────
  const [
    matsResult,
    todayTxResult,
    allTxResult,
    recentTxResult,
    activePlansResult,
    profilesResult,
  ] = await Promise.all([
    supabase
      .from("materials")
      .select("id, name, unit")
      .eq("company_id", company_id)
      .order("name"),
    supabase
      .from("material_transactions")
      .select("type, quantity")
      .eq("company_id", company_id)
      .eq("transaction_date", today),
    // Limit to last 100 for balance calculation (dashboard overview)
    supabase
      .from("material_transactions")
      .select("material_id, type, quantity")
      .eq("company_id", company_id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("material_transactions")
      .select("id, type, quantity, note, transaction_date, material_id, created_by")
      .eq("company_id", company_id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("production_plans")
      .select("id, name, planned_quantity, actual_quantity, start_date, end_date")
      .eq("company_id", company_id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("profiles")
      .select("id, full_name")
      .eq("company_id", company_id),
  ]);

  // ── Reuse matsResult + profilesResult — no second round-trip
  const recentRaw = recentTxResult.data ?? [];
  const txMatMap = new Map((matsResult.data ?? []).map((m) => [m.id, m]));
  const txProfileMap = new Map((profilesResult.data ?? []).map((p) => [p.id, p]));

  const recentTxs = recentRaw.map((tx) => ({
    ...tx,
    material_name: txMatMap.get(tx.material_id)?.name ?? "—",
    material_unit: txMatMap.get(tx.material_id)?.unit ?? "",
    creator_name: txProfileMap.get(tx.created_by)?.full_name ?? "—",
  }));

  // ── Stat card values ────────────────────────────────────
  const todayTxs = todayTxResult.data ?? [];
  const todayInQty = todayTxs
    .filter((t) => t.type === "income" || t.type === "return")
    .reduce((s, t) => s + Number(t.quantity), 0);
  const todayInCount = todayTxs.filter((t) => t.type === "income").length;
  const todayOutQty = todayTxs
    .filter((t) => t.type === "expense" || t.type === "defect")
    .reduce((s, t) => s + Number(t.quantity), 0);
  const todayOutCount = todayTxs.filter((t) => t.type === "expense").length;
  const materialsCount = matsResult.data?.length ?? 0;
  const activePlansCount = activePlansResult.data?.length ?? 0;

  // ── Material balances ───────────────────────────────────
  const balMap = new Map<
    string,
    { income: number; expense: number; balance: number }
  >();
  for (const mat of matsResult.data ?? []) {
    balMap.set(mat.id, { income: 0, expense: 0, balance: 0 });
  }
  for (const tx of allTxResult.data ?? []) {
    const b = balMap.get(tx.material_id);
    if (!b) continue;
    const qty = Number(tx.quantity);
    if (tx.type === "income" || tx.type === "return") {
      b.income += qty;
      b.balance += qty;
    } else {
      b.expense += qty;
      b.balance -= qty;
    }
  }

  const materials = matsResult.data ?? [];
  const activePlans = activePlansResult.data ?? [];

  const firstName =
    profile?.full_name?.split(" ")[0] ||
    user.email?.split("@")[0] ||
    "Пользователь";

  const todayLabel = new Date().toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // ─────────────────────────────────────────────────────────

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--text)]">
          Добро пожаловать, {firstName}
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1 capitalize">{todayLabel}</p>
      </div>

      {/* ── Stat cards ─────────────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Материалов в справочнике"
          mobileLabel="Материалы"
          value={formatCompact(materialsCount)}
          sub={materialsCount === 1 ? "позиция" : "позиций"}
          iconBg="bg-[#00f5c4]/10"
          iconColor="text-[#00f5c4]"
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          }
        />
        <StatCard
          label="Приход сегодня"
          mobileLabel="Приход"
          value={`+${formatCompact(todayInQty)}`}
          sub={`${todayInCount} ${todayInCount === 1 ? "запись" : "записей"}`}
          valueColor="text-green-600"
          iconBg="bg-green-50"
          iconColor="text-green-600"
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 11l5-5m0 0l5 5m-5-5v12" />
            </svg>
          }
        />
        <StatCard
          label="Расход сегодня"
          mobileLabel="Расход"
          value={`-${formatCompact(todayOutQty)}`}
          sub={`${todayOutCount} ${todayOutCount === 1 ? "запись" : "записей"}`}
          valueColor="text-red-600"
          iconBg="bg-red-50"
          iconColor="text-red-600"
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 13l-5 5m0 0l-5-5m5 5V6" />
            </svg>
          }
        />
        <StatCard
          label="Активных планов"
          mobileLabel="Планы"
          value={formatCompact(activePlansCount)}
          sub={activePlansCount === 1 ? "в работе" : "в работе"}
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          }
        />
      </div>

      {/* ── Main grid: balances + recent transactions ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-4">
        {/* Balance table (3/5) */}
        <div className="lg:col-span-3 bg-[var(--card)] rounded-xl border border-[var(--border)]">
          <div className="px-5 py-4 border-b border-[var(--border)]">
            <SectionHeader
              title="Остатки по материалам"
              href="/dashboard/transactions"
              linkLabel="Все транзакции →"
            />
          </div>
          <BalanceTableRealtime
            materials={materials}
            initialBalances={Object.fromEntries(
              materials.map((mat) => [mat.id, balMap.get(mat.id) ?? { income: 0, expense: 0, balance: 0 }])
            )}
            companyId={company_id}
          />
        </div>

        {/* Recent transactions (2/5) */}
        <div className="lg:col-span-2 bg-[var(--card)] rounded-xl border border-[var(--border)]">
          <div className="px-5 py-4 border-b border-[var(--border)]">
            <SectionHeader
              title="Последние транзакции"
              href="/dashboard/transactions"
            />
          </div>
          {recentTxs.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-[var(--muted)]">Транзакций нет</p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {recentTxs.map((tx) => {
                const cfg = TYPE_COLORS[tx.type as TxType];
                const sign =
                  tx.type === "income" || tx.type === "return" ? "+" : "−";
                return (
                  <div
                    key={tx.id}
                    className="px-5 py-3 flex items-center gap-3 hover:bg-[var(--bg3)]"
                  >
                    <span
                      className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.bg} ${cfg.text}`}
                    >
                      {TYPE_LABELS[tx.type as TxType]}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--text)] truncate">
                        {tx.material_name}
                      </p>
                      <p className="text-xs text-[var(--muted)]">
                        {fmtDate(tx.transaction_date)}
                      </p>
                    </div>
                    <span
                      className={`text-sm font-bold tabular-nums font-mono shrink-0 ${
                        sign === "+" ? "text-green-700" : "text-red-600"
                      }`}
                    >
                      {sign}
                      {formatCompact(Number(tx.quantity))}
                      <span className="text-xs font-normal text-[var(--muted)] ml-0.5">
                        {tx.material_unit}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Active Plans ────────────────────────────────── */}
      <div className="bg-[var(--card)] rounded-xl border border-[var(--border)]">
        <div className="px-5 py-4 border-b border-[var(--border)]">
          <SectionHeader
            title="Активные производственные планы"
            href="/dashboard/plans"
            linkLabel="Все планы →"
          />
        </div>

        {activePlans.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm text-[var(--muted)]">
              Нет активных планов
            </p>
            <Link
              href="/dashboard/plans"
              className="mt-2 inline-block text-sm text-[#00f5c4] hover:underline"
            >
              Создать план
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {activePlans.map((plan) => {
              const pct =
                plan.planned_quantity > 0
                  ? Math.min(
                      (Number(plan.actual_quantity) /
                        Number(plan.planned_quantity)) *
                        100,
                      100
                    )
                  : 0;

              return (
                <Link
                  key={plan.id}
                  href={`/dashboard/plans/${plan.id}`}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-[var(--bg3)] transition-colors group"
                >
                  {/* Name + period */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--text)] truncate group-hover:text-[#00f5c4] transition-colors">
                      {plan.name}
                    </p>
                    <p className="text-xs text-[var(--muted)] mt-0.5">
                      {fmtDate(plan.start_date)} — {fmtDate(plan.end_date)}
                    </p>
                  </div>

                  {/* Progress */}
                  <div className="w-48 shrink-0 hidden sm:block">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-[var(--bg3)] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#00f5c4] transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs tabular-nums font-medium text-[var(--muted)] w-9 text-right">
                        {pct.toFixed(0)}%
                      </span>
                    </div>
                    <p className="text-xs text-[var(--muted)] mt-0.5 tabular-nums">
                      {formatCompact(Number(plan.actual_quantity))} /{" "}
                      {formatCompact(Number(plan.planned_quantity))}
                    </p>
                  </div>

                  <svg
                    className="w-4 h-4 text-[var(--muted)] group-hover:text-[#00f5c4] transition-colors shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
