import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import NoCompanyState from "@/components/ui/NoCompanyState";
import { formatCompact, formatQuantity } from "@/lib/utils/format";
import BalanceCard, { type BalanceData } from "@/components/BalanceCard";
import AnimatedNumber from "@/components/ui/AnimatedNumber";

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

function fmtDate(s: string) {
  const [y, m, d] = s.split("-");
  return `${d}.${m}.${y}`;
}

// ─── Sub-components ───────────────────────────────────────

type Trend = { pct: number | null; dir: "up" | "down" | "flat"; good: boolean };

// Compare today's value against yesterday's. `invert` — for expense-type
// metrics where growth is bad news (red), not good (green).
function computeTrend(today: number, yesterday: number, invert = false): Trend | null {
  if (today === 0 && yesterday === 0) return null;
  if (yesterday === 0) return { pct: null, dir: "up", good: !invert };
  const pct = ((today - yesterday) / yesterday) * 100;
  if (Math.abs(pct) < 0.5) return { pct: 0, dir: "flat", good: true };
  const dir = pct > 0 ? "up" : "down";
  const good = invert ? pct < 0 : pct > 0;
  return { pct, dir, good };
}

function TrendBadge({ trend }: { trend: Trend }) {
  const color = trend.dir === "flat" ? "text-[var(--muted)]" : trend.good ? "text-[var(--success)]" : "text-[var(--danger)]";
  const arrow = trend.dir === "up" ? "↑" : trend.dir === "down" ? "↓" : "→";
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums ${color}`}>
      {arrow}
      {trend.pct != null && trend.pct !== 0 && `${Math.abs(trend.pct).toFixed(0)}%`}
      <span className="text-[var(--muted)] font-normal ml-0.5">vs вчера</span>
    </span>
  );
}

function StatCard({
  label,
  mobileLabel,
  value,
  prefix = "",
  sub,
  trend,
  valueColor = "text-[var(--text)]",
  iconBg,
  iconColor,
  icon,
  delay = 0,
}: {
  label: string;
  mobileLabel?: string;
  value: number;
  prefix?: string;
  sub: string;
  trend?: Trend | null;
  valueColor?: string;
  iconBg: string;
  iconColor: string;
  icon: React.ReactNode;
  delay?: number;
}) {
  return (
    <div
      className="bg-[var(--card)] rounded-xl border border-[var(--border)] fade-in-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Mobile: compact, no icon */}
      <div className="sm:hidden p-4">
        <p className="text-xs text-[var(--muted)] mb-1">{mobileLabel ?? label}</p>
        <p className={`text-num-lg ${valueColor}`}>
          <AnimatedNumber value={value} prefix={prefix} />
        </p>
        <p className="text-xs text-[var(--muted)] mt-0.5">
          {trend ? <TrendBadge trend={trend} /> : sub}
        </p>
      </div>
      {/* Desktop: icon + text */}
      <div className="hidden sm:flex p-5 items-start gap-4">
        <div className={`flex items-center justify-center w-11 h-11 rounded-xl shrink-0 ${iconBg} ${iconColor}`}>
          {icon}
        </div>
        <div className="min-w-0 overflow-hidden">
          <p className="text-sm text-[var(--muted)] leading-tight truncate">{label}</p>
          <p className={`text-num-lg mt-0.5 ${valueColor}`}>
            <AnimatedNumber value={value} prefix={prefix} />
          </p>
          <p className="text-xs text-[var(--muted)] mt-0.5 flex items-center gap-2">
            <span>{sub}</span>
            {trend && <TrendBadge trend={trend} />}
          </p>
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
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  // ── All 7 queries in parallel — no waterfall ───────────
  const [
    matsResult,
    todayTxResult,
    yesterdayTxResult,
    allTxResult,
    recentTxResult,
    activePlansResult,
    profilesResult,
  ] = await Promise.all([
    supabase
      .from("materials")
      .select("id, name, unit, norm_concrete, norm_rebar")
      .eq("company_id", company_id)
      .order("name"),
    supabase
      .from("material_transactions")
      .select("type, quantity, material_id")
      .eq("company_id", company_id)
      .eq("transaction_date", today),
    supabase
      .from("material_transactions")
      .select("type, quantity")
      .eq("company_id", company_id)
      .eq("transaction_date", yesterday),
    // Full history — needed for accurate balances + 7-day activity filter
    supabase
      .from("material_transactions")
      .select("material_id, type, quantity, transaction_date")
      .eq("company_id", company_id),
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

  // ── Yesterday comparison for trend badges ───────────────
  const yesterdayTxs = yesterdayTxResult.data ?? [];
  const yesterdayInQty = yesterdayTxs
    .filter((t) => t.type === "income" || t.type === "return")
    .reduce((s, t) => s + Number(t.quantity), 0);
  const yesterdayOutQty = yesterdayTxs
    .filter((t) => t.type === "expense" || t.type === "defect")
    .reduce((s, t) => s + Number(t.quantity), 0);
  const inTrend = computeTrend(todayInQty, yesterdayInQty);
  const outTrend = computeTrend(todayOutQty, yesterdayOutQty, true);

  // ── Today's production summary ──────────────────────────
  // Production materials = those with both norms set (the finished products)
  const productionMatIds = new Set(
    (matsResult.data ?? [])
      .filter((m) => m.norm_concrete != null && m.norm_rebar != null)
      .map((m) => m.id)
  );
  type TodayProdRow = { name: string; unit: string; qty: number };
  const todayProdMap = new Map<string, TodayProdRow>();
  for (const tx of todayTxs) {
    if (tx.type !== "income") continue;
    if (!productionMatIds.has(tx.material_id)) continue;
    const mat = txMatMap.get(tx.material_id);
    if (!mat) continue;
    const existing = todayProdMap.get(tx.material_id);
    if (existing) {
      existing.qty += Number(tx.quantity);
    } else {
      todayProdMap.set(tx.material_id, { name: mat.name, unit: mat.unit, qty: Number(tx.quantity) });
    }
  }
  const todayProduction = Array.from(todayProdMap.values()).sort((a, b) => b.qty - a.qty);
  const todayProdTotal = todayProduction.reduce((s, r) => s + r.qty, 0);

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

  const activePlans = activePlansResult.data ?? [];

  // ── Active materials: movement in last 7 days, max 10, most recent first
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
  const lastActivity = new Map<string, string>();
  for (const tx of allTxResult.data ?? []) {
    const d = tx.transaction_date as string | null;
    if (!d || d < sevenDaysAgo) continue;
    const prev = lastActivity.get(tx.material_id);
    if (!prev || d > prev) lastActivity.set(tx.material_id, d);
  }
  const activeBalances: BalanceData[] = Array.from(lastActivity.entries())
    .sort((a, b) => b[1].localeCompare(a[1]))
    .slice(0, 10)
    .flatMap(([id]) => {
      const mat = txMatMap.get(id);
      if (!mat) return [];
      const b = balMap.get(id) ?? { income: 0, expense: 0, balance: 0 };
      return [{
        material_id: id,
        name: mat.name,
        unit: mat.unit,
        balance: b.balance,
        totalIn: b.income,
        totalOut: b.expense,
      }];
    });

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
    <div className="p-3 sm:p-6 max-w-7xl mx-auto">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="mb-4 sm:mb-6">
        <h1 className="text-display text-[var(--text)]">
          Добро пожаловать, {firstName}
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1 capitalize">{todayLabel}</p>
      </div>

      {/* ── Quick produce CTA (shown when production materials exist) ─ */}
      {productionMatIds.size > 0 && (
        <Link
          href="/dashboard/produce"
          className="group flex items-center gap-4 px-5 py-4 rounded-xl border border-[#00f5c4]/30 bg-[#00f5c4]/5 hover:bg-[#00f5c4]/10 hover:border-[#00f5c4]/60 transition-all mb-5"
        >
          <div className="w-10 h-10 rounded-xl bg-[#00f5c4]/15 flex items-center justify-center shrink-0 group-hover:bg-[#00f5c4]/25 transition-colors">
            <svg className="w-5 h-5 text-[#00f5c4]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[var(--text)] group-hover:text-[#00f5c4] transition-colors">Записать выпуск</p>
            <p className="text-xs text-[var(--muted)]">Быстрый ввод — 3 нажатия</p>
          </div>
          <svg className="w-4 h-4 text-[var(--muted)] group-hover:text-[#00f5c4] transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      )}

      {/* ── Stat cards ─────────────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 sm:gap-3 mb-4 sm:mb-6">
        <StatCard
          label="Материалов в справочнике"
          mobileLabel="Материалы"
          value={materialsCount}
          sub={materialsCount === 1 ? "позиция" : "позиций"}
          delay={0}
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
          value={todayInQty}
          prefix="+"
          sub={`${todayInCount} ${todayInCount === 1 ? "запись" : "записей"}`}
          trend={inTrend}
          delay={40}
          valueColor="text-[var(--success)]"
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
          value={todayOutQty}
          prefix="−"
          sub={`${todayOutCount} ${todayOutCount === 1 ? "запись" : "записей"}`}
          trend={outTrend}
          delay={80}
          valueColor="text-[var(--danger)]"
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
          value={activePlansCount}
          sub="в работе"
          delay={120}
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          }
        />
      </div>

      {/* ── Today's production summary ────────────────── */}
      {todayProduction.length > 0 && (
        <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] mb-4 overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-[#00f5c4]/15 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-[#00f5c4]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
              </div>
              <h2 className="text-sm font-semibold text-[var(--text)]">Выпущено сегодня</h2>
            </div>
            <span className="text-xs font-semibold text-[#00f5c4] tabular-nums">
              {formatCompact(todayProdTotal)} шт. итого
            </span>
          </div>
          <div className="flex flex-wrap gap-3 px-5 py-4">
            {todayProduction.map((row) => (
              <div
                key={row.name}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg3)]"
              >
                <span className="text-sm font-medium text-[var(--text)]">{row.name}</span>
                <span className="text-sm font-bold text-[#00f5c4] tabular-nums font-mono">
                  {formatCompact(row.qty)}
                </span>
                <span className="text-xs text-[var(--muted)]">{row.unit}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Balances: materials with movement in last 7 days ─ */}
      <div className="mb-2 sm:mb-4">
        <SectionHeader
          title="Остатки по материалам"
          href="/dashboard/warehouse"
          linkLabel="Все материалы →"
        />
        {activeBalances.length === 0 ? (
          <div className="py-8 text-center bg-[var(--card)] rounded-xl border border-[var(--border)]">
            <p className="text-sm text-[var(--muted)]">
              Нет движения материалов за последние 7 дней
            </p>
            <Link
              href="/dashboard/warehouse"
              className="mt-2 inline-block text-sm text-[#00f5c4] hover:underline"
            >
              Открыть склад
            </Link>
          </div>
        ) : (
          <BalanceCard balances={activeBalances} showHeader={false} />
        )}
      </div>

      {/* ── Recent transactions — compact chips ─────────── */}
      <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] mb-2 sm:mb-4 overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border)]">
          <SectionHeader
            title="Последние транзакции"
            href="/dashboard/transactions"
          />
        </div>
        {recentTxs.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-[var(--muted)]">Транзакций нет</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 px-5 py-4">
            {recentTxs.map((tx) => {
              // Number color by type: green income, red expense,
              // amber defect, blue return
              const qColor =
                tx.type === "income"
                  ? "text-[var(--success)]"
                  : tx.type === "expense"
                  ? "text-[var(--danger)]"
                  : tx.type === "defect"
                  ? "text-[var(--warning)]"
                  : "text-[var(--info)]";
              const sign = tx.type === "income" || tx.type === "return" ? "+" : "−";
              return (
                <Link
                  key={tx.id}
                  href="/dashboard/transactions"
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg3)] hover:bg-[var(--bg2)] border border-transparent hover:border-[var(--border)] transition-colors tap-scale"
                  title={`${TYPE_LABELS[tx.type as TxType]} · ${fmtDate(tx.transaction_date)}`}
                >
                  <span className="text-sm font-medium text-[var(--text)] max-w-[160px] truncate">
                    {tx.material_name}
                  </span>
                  <span className={`text-sm font-bold tabular-nums font-mono ${qColor}`}>
                    {sign}
                    {formatQuantity(Number(tx.quantity))}
                  </span>
                  <span className="text-xs text-[var(--muted)]">{tx.material_unit}</span>
                </Link>
              );
            })}
          </div>
        )}
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
