import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import NoCompanyState from "@/components/ui/NoCompanyState";
import { formatCompact, formatQuantity } from "@/lib/utils/format";
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

// Timeline dot colors by operation kind
const DOT_COLOR: Record<string, string> = {
  income: "bg-[var(--success)]",
  expense: "bg-[var(--danger)]",
  return: "bg-[var(--info)]",
  defect: "bg-[var(--warning)]",
  production: "bg-[var(--accent)]",
};

const Q_COLOR: Record<string, string> = {
  income: "text-[var(--success)]",
  expense: "text-[var(--danger)]",
  return: "text-[var(--info)]",
  defect: "text-[var(--warning)]",
  production: "text-[var(--accent)]",
};

type Trend = { pct: number | null; dir: "up" | "down" | "flat"; good: boolean };

function computeTrend(today: number, yesterday: number): Trend | null {
  if (today === 0 && yesterday === 0) return null;
  if (yesterday === 0) return { pct: null, dir: "up", good: true };
  const pct = ((today - yesterday) / yesterday) * 100;
  if (Math.abs(pct) < 0.5) return { pct: 0, dir: "flat", good: true };
  return { pct, dir: pct > 0 ? "up" : "down", good: pct > 0 };
}

type StockLevel = "normal" | "low" | "critical";

function stockLevel(balance: number, threshold: number | undefined): StockLevel {
  if (threshold != null && threshold > 0) {
    if (balance <= threshold) return "critical";
    if (balance <= threshold * 2) return "low";
    return "normal";
  }
  return balance <= 0 ? "critical" : "normal";
}

const LEVEL_DOT: Record<StockLevel, string> = {
  normal: "bg-[var(--success)]",
  low: "bg-[var(--warning)]",
  critical: "bg-[var(--danger)]",
};

const LEVEL_NUM: Record<StockLevel, string> = {
  normal: "text-[var(--text)]",
  low: "text-[var(--warning)]",
  critical: "text-[var(--danger)]",
};

function fmtDate(s: string) {
  const [y, m, d] = s.split("-");
  return `${d}.${m}.${y}`;
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

  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  // ── All queries in parallel — no waterfall ──────────────
  const [
    companyResult,
    matsResult,
    todayTxResult,
    yesterdayTxResult,
    allTxResult,
    recentTxResult,
    activePlansResult,
    profilesResult,
    thresholdsResult,
  ] = await Promise.all([
    supabase.from("companies").select("name").eq("id", company_id).single(),
    supabase
      .from("materials")
      .select("id, name, unit, norm_concrete, norm_rebar")
      .eq("company_id", company_id)
      .order("name"),
    supabase
      .from("material_transactions")
      .select("type, quantity, material_id")
      .eq("company_id", company_id)
      .is("deleted_at", null)
      .eq("transaction_date", today),
    supabase
      .from("material_transactions")
      .select("type, quantity, material_id")
      .eq("company_id", company_id)
      .is("deleted_at", null)
      .eq("transaction_date", yesterday),
    supabase
      .from("material_transactions")
      .select("material_id, type, quantity, transaction_date")
      .eq("company_id", company_id)
      .is("deleted_at", null),
    supabase
      .from("material_transactions")
      .select("id, type, quantity, transaction_date, created_at, material_id, created_by")
      .eq("company_id", company_id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(12),
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
    supabase
      .from("material_thresholds")
      .select("material_id, min_quantity")
      .eq("company_id", company_id),
  ]);

  const materials = matsResult.data ?? [];
  const matById = new Map(materials.map((m) => [m.id, m]));
  const profileById = new Map((profilesResult.data ?? []).map((p) => [p.id, p]));

  const thresholds: Record<string, number> = {};
  for (const t of thresholdsResult.data ?? []) {
    thresholds[t.material_id] = Number(t.min_quantity);
  }

  // ── Production materials (finished products have both norms)
  const productionMatIds = new Set(
    materials.filter((m) => m.norm_concrete != null && m.norm_rebar != null).map((m) => m.id)
  );
  const hasProduction = productionMatIds.size > 0;

  const todayTxs = todayTxResult.data ?? [];
  const yesterdayTxs = yesterdayTxResult.data ?? [];

  // ── HERO: today's output (or generic in/out fallback) ───
  const prodTotal = (txs: { type: string; quantity: number; material_id: string }[]) =>
    txs
      .filter((t) => t.type === "income" && productionMatIds.has(t.material_id))
      .reduce((s, t) => s + Number(t.quantity), 0);

  const todayProdTotal = prodTotal(todayTxs);
  const yesterdayProdTotal = prodTotal(yesterdayTxs);
  const prodTrend = computeTrend(todayProdTotal, yesterdayProdTotal);

  // Fallback hero for companies without production norms
  const todayInQty = todayTxs
    .filter((t) => t.type === "income" || t.type === "return")
    .reduce((s, t) => s + Number(t.quantity), 0);
  const todayOutQty = todayTxs
    .filter((t) => t.type === "expense" || t.type === "defect")
    .reduce((s, t) => s + Number(t.quantity), 0);

  // Today's top material deductions (what production consumed)
  const outByMat = new Map<string, number>();
  for (const t of todayTxs) {
    if (t.type !== "expense") continue;
    outByMat.set(t.material_id, (outByMat.get(t.material_id) ?? 0) + Number(t.quantity));
  }
  const topDeductions = Array.from(outByMat.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .flatMap(([id, qty]) => {
      const m = matById.get(id);
      return m ? [`${m.name.toLowerCase()} −${formatQuantity(qty)} ${m.unit}`] : [];
    });

  // ── Balances (full history) + 7-day-active ticker ───────
  const balMap = new Map<string, number>();
  for (const m of materials) balMap.set(m.id, 0);
  for (const tx of allTxResult.data ?? []) {
    const qty = Number(tx.quantity);
    const delta = tx.type === "income" || tx.type === "return" ? qty : -qty;
    balMap.set(tx.material_id, (balMap.get(tx.material_id) ?? 0) + delta);
  }

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
  const ticker = Array.from(lastActivity.entries())
    .sort((a, b) => b[1].localeCompare(a[1]))
    .slice(0, 10)
    .flatMap(([id]) => {
      const m = matById.get(id);
      if (!m) return [];
      const balance = balMap.get(id) ?? 0;
      return [{ id, name: m.name, unit: m.unit, balance, level: stockLevel(balance, thresholds[id]) }];
    });

  // ── Timeline ─────────────────────────────────────────────
  const timeline = (recentTxResult.data ?? []).map((tx) => {
    const mat = matById.get(tx.material_id);
    const isProduction = tx.type === "income" && productionMatIds.has(tx.material_id);
    const kind = isProduction ? "production" : (tx.type as string);
    const created = new Date(tx.created_at as string);
    const isToday = (tx.created_at as string).split("T")[0] === today;
    const time = created.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    const day = created.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
    return {
      id: tx.id,
      kind,
      label: isProduction ? "Выпуск" : TYPE_LABELS[tx.type as TxType],
      material: mat?.name ?? "—",
      unit: mat?.unit ?? "",
      qty: Number(tx.quantity),
      sign: tx.type === "income" || tx.type === "return" ? "+" : "−",
      who: tx.created_by ? profileById.get(tx.created_by)?.full_name ?? null : null,
      timeLabel: isToday ? time : `${day} ${time}`,
    };
  });

  // ── Plans ────────────────────────────────────────────────
  const plans = (activePlansResult.data ?? []).map((p) => {
    const pct =
      Number(p.planned_quantity) > 0
        ? (Number(p.actual_quantity) / Number(p.planned_quantity)) * 100
        : 0;
    const daysLeft = Math.ceil(
      (new Date(p.end_date + "T23:59:59").getTime() - Date.now()) / (24 * 60 * 60 * 1000)
    );
    return { ...p, pct, daysLeft };
  });

  const todayLabel = new Date().toLocaleDateString("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "long",
  });
  const companyName = companyResult.data?.name ?? "";

  // Desktop stock list — critical first (mobile ticker is recency-first)
  const levelOrder: Record<StockLevel, number> = { critical: 0, low: 1, normal: 2 };
  const desktopStocks = [...ticker].sort((a, b) => levelOrder[a.level] - levelOrder[b.level]);

  // ─────────────────────────────────────────────────────────

  return (
    <>
    {/* ════ DESKTOP (lg+) — calm three-metric dashboard ════ */}
    <div className="hidden lg:block max-w-6xl mx-auto px-6 py-8 w-full">
      <p className="text-sm text-[var(--muted)] capitalize mb-6">
        {todayLabel}
        {companyName && <span className="text-[var(--muted-2)]"> · {companyName}</span>}
      </p>

      {/* Metric cards row */}
      <div className="grid grid-cols-3 gap-4">
        <div data-tour="hero-output" className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-5">
          <p className="text-sm text-[var(--muted)]">Выпуск сегодня</p>
          <div className="flex items-baseline gap-2.5 mt-2">
            <span className="num text-3xl font-semibold text-[var(--text)]">
              {hasProduction ? formatCompact(todayProdTotal) : "—"}
            </span>
            {hasProduction && <span className="text-sm text-[var(--muted)]">шт</span>}
            {prodTrend && prodTrend.dir !== "flat" && (
              <span className={`num text-xs font-semibold ${prodTrend.good ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
                {prodTrend.dir === "up" ? "↑" : "↓"}
                {prodTrend.pct != null && `${Math.abs(prodTrend.pct).toFixed(0)}%`}
              </span>
            )}
          </div>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-5">
          <p className="text-sm text-[var(--muted)]">Движений сегодня</p>
          <div className="flex items-baseline gap-2.5 mt-2">
            <span className="num text-3xl font-semibold text-[var(--text)]">{todayTxs.length}</span>
            <span className="num text-xs text-[var(--muted)]">
              <span className="text-[var(--success)]">+{formatCompact(todayInQty)}</span>
              {" / "}
              <span className="text-[var(--danger)]">−{formatCompact(todayOutQty)}</span>
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-5">
          <p className="text-sm text-[var(--muted)]">Активных планов</p>
          <div className="flex items-baseline gap-2.5 mt-2">
            <span className="num text-3xl font-semibold text-[var(--text)]">{plans.length}</span>
            {plans.some((p) => p.daysLeft < 0) && (
              <span className="text-xs font-semibold text-[var(--danger)]">
                {plans.filter((p) => p.daysLeft < 0).length} просрочен
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Two-column: activity feed | stocks + plans */}
      <div className="grid grid-cols-[1fr_360px] gap-6 mt-6 items-start">
        {/* Activity */}
        <div data-tour="activity" className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)]">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)]">
            <h2 className="text-sm font-semibold text-[var(--text)]">Активность</h2>
            <Link href="/dashboard/transactions" className="text-xs text-[var(--accent)] hover:underline">
              Всё движение →
            </Link>
          </div>
          {timeline.length === 0 ? (
            <p className="text-sm text-[var(--muted)] text-center py-10">Сегодня пока тихо</p>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {timeline.map((item) => (
                <div key={item.id} className="flex items-center gap-3 px-5 h-11 hover:bg-[var(--surface-2)] transition-colors duration-150">
                  <span className="num text-xs text-[var(--muted-2)] w-20 shrink-0">{item.timeLabel}</span>
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${DOT_COLOR[item.kind]}`} />
                  <span className="text-sm text-[var(--text)] truncate flex-1 min-w-0">
                    <span className="font-medium">{item.label}</span>
                    <span className="text-[var(--muted)]"> · {item.material}</span>
                    {item.who && <span className="text-[var(--muted-2)]"> · {item.who}</span>}
                  </span>
                  <span className={`num text-sm font-semibold shrink-0 ${Q_COLOR[item.kind]}`}>
                    {item.sign}{formatQuantity(item.qty)} {item.unit}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Stocks — critical first */}
          <div data-tour="stock" className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)]">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)]">
              <h2 className="text-sm font-semibold text-[var(--text)]">Остатки</h2>
              <Link href="/dashboard/warehouse" className="text-xs text-[var(--accent)] hover:underline">
                Весь склад →
              </Link>
            </div>
            {desktopStocks.length === 0 ? (
              <p className="text-sm text-[var(--muted)] text-center py-8">Нет движения за 7 дней</p>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {desktopStocks.map((t) => (
                  <Link
                    key={t.id}
                    href={`/dashboard/transactions?material_id=${t.id}`}
                    className="flex items-center gap-2.5 px-5 h-10 hover:bg-[var(--surface-2)] transition-colors duration-150"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${LEVEL_DOT[t.level]}`} />
                    <span className="text-sm text-[var(--text)] truncate flex-1">{t.name}</span>
                    <span className={`num text-sm font-semibold shrink-0 ${LEVEL_NUM[t.level]}`}>
                      {formatCompact(t.balance)}
                      <span className="text-xs font-normal text-[var(--muted)] ml-1">{t.unit}</span>
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Plans */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)]">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)]">
              <h2 className="text-sm font-semibold text-[var(--text)]">Планы</h2>
              <Link href="/dashboard/plans" className="text-xs text-[var(--accent)] hover:underline">
                Все планы →
              </Link>
            </div>
            {plans.length === 0 ? (
              <p className="text-sm text-[var(--muted)] text-center py-8">Нет активных планов</p>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {plans.map((plan) => {
                  const overdue = plan.daysLeft < 0;
                  return (
                    <Link
                      key={plan.id}
                      href={`/dashboard/plans/${plan.id}`}
                      className="block px-5 py-3 hover:bg-[var(--surface-2)] transition-colors duration-150"
                    >
                      <div className="flex items-baseline justify-between gap-2 mb-1.5">
                        <span className="text-sm text-[var(--text)] truncate">{plan.name}</span>
                        <span className={`num text-xs font-semibold shrink-0 ${
                          plan.pct >= 100 ? "text-[var(--success)]" : overdue ? "text-[var(--danger)]" : "text-[var(--muted)]"
                        }`}>
                          {Math.min(plan.pct, 999).toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-1 rounded-full bg-[var(--surface-3)] overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            plan.pct >= 100 ? "bg-[var(--success)]" : overdue ? "bg-[var(--danger)]" : "bg-[var(--accent)]"
                          }`}
                          style={{ width: `${Math.min(plan.pct, 100)}%` }}
                        />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>

    {/* ════ MOBILE (<lg) — unchanged command center ════ */}
    <div className="lg:hidden max-w-7xl mx-auto">
      {/* ── Thin context row ───────────────────────────── */}
      <div className="px-4 sm:px-6 pt-4 sm:pt-6">
        <p className="text-label fade-in-up">
          {todayLabel}
          {companyName && <span className="text-[var(--muted-2)]"> · {companyName}</span>}
        </p>

        {/* ── HERO: the one number that matters today ──── */}
        <div data-tour="hero-output" className="mt-4 mb-5 fade-in-up" style={{ animationDelay: "40ms" }}>
          {hasProduction ? (
            <>
              <p className="text-label mb-1.5">Выпуск сегодня</p>
              <div className="flex items-baseline gap-3 flex-wrap">
                <span className="num font-bold text-[var(--text)] leading-none text-[56px] tracking-tighter">
                  <AnimatedNumber value={todayProdTotal} />
                </span>
                <span className="text-lg text-[var(--muted)]">шт</span>
                {prodTrend && prodTrend.dir !== "flat" && (
                  <span
                    className={`num text-sm font-bold ${
                      prodTrend.good ? "text-[var(--success)]" : "text-[var(--danger)]"
                    }`}
                  >
                    {prodTrend.dir === "up" ? "↑" : "↓"}
                    {prodTrend.pct != null && `${Math.abs(prodTrend.pct).toFixed(0)}%`}
                    <span className="text-[var(--muted)] font-normal ml-1">vs вчера</span>
                  </span>
                )}
              </div>
              {topDeductions.length > 0 && (
                <p className="num text-xs text-[var(--muted)] mt-2">
                  ▸ {topDeductions.join(" · ")}
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-label mb-1.5">Движение сегодня</p>
              <div className="flex items-baseline gap-4">
                <span className="num font-bold leading-none text-[44px] tracking-tighter text-[var(--success)]">
                  +<AnimatedNumber value={todayInQty} />
                </span>
                <span className="num font-bold leading-none text-[44px] tracking-tighter text-[var(--danger)]">
                  −<AnimatedNumber value={todayOutQty} />
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── TICKER: 7-day-active stock, horizontal ──────── */}
      {ticker.length > 0 && (
        <div
          data-tour="stock"
          className="flex overflow-x-auto border-y border-[var(--border)] bg-[var(--surface-1)]/60 mb-5 snap-x fade-in-up"
          style={{ animationDelay: "80ms" }}
        >
          {ticker.map((t) => (
            <Link
              key={t.id}
              href={`/dashboard/transactions?material_id=${t.id}`}
              className="flex items-center gap-2 px-4 py-3 border-r border-[var(--border)] whitespace-nowrap snap-start shrink-0 hover:bg-[var(--surface-2)] transition-colors"
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${LEVEL_DOT[t.level]}`} />
              <span className="text-label">{t.name}</span>
              <span className={`num text-sm font-bold ${LEVEL_NUM[t.level]}`}>
                {formatCompact(t.balance)}
                <span className="text-[10px] font-normal text-[var(--muted)] ml-0.5">{t.unit}</span>
              </span>
            </Link>
          ))}
          <Link
            href="/dashboard/warehouse"
            className="flex items-center px-4 py-3 whitespace-nowrap shrink-0 text-xs font-medium text-[var(--accent)] hover:bg-[var(--surface-2)] transition-colors"
          >
            Весь склад →
          </Link>
        </div>
      )}

      <div className="px-4 sm:px-6 pb-6">
        {/* ── TIMELINE: today's activity feed ───────────── */}
        <section data-tour="activity" className="mb-6 fade-in-up" style={{ animationDelay: "120ms" }}>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-label">Активность</h2>
            <Link href="/dashboard/transactions" className="text-xs text-[var(--accent)] hover:underline font-medium">
              Всё движение →
            </Link>
          </div>

          {timeline.length === 0 ? (
            <div className="py-10 text-center bg-[var(--surface-1)] rounded-xl border border-[var(--border)]">
              <p className="text-sm text-[var(--muted)]">Сегодня пока тихо</p>
              <p className="text-xs text-[var(--muted-2)] mt-1">Операции появятся здесь лентой</p>
            </div>
          ) : (
            <ol>
              {timeline.map((item, i) => (
                <li key={item.id} className="flex gap-3">
                  {/* time */}
                  <span className="num text-[11px] text-[var(--muted)] w-12 shrink-0 pt-0.5 text-right">
                    {item.timeLabel}
                  </span>
                  {/* dot + connector */}
                  <span className="flex flex-col items-center shrink-0">
                    <span className={`w-2 h-2 rounded-full mt-1 ${DOT_COLOR[item.kind]}`} />
                    {i < timeline.length - 1 && (
                      <span className="w-px flex-1 bg-[var(--border)] my-0.5" />
                    )}
                  </span>
                  {/* content */}
                  <div className="pb-4 min-w-0 flex-1">
                    <p className="text-sm text-[var(--text)] leading-tight truncate">
                      <span className="font-semibold">{item.label}</span>
                      <span className="text-[var(--muted)]"> · </span>
                      {item.material}
                    </p>
                    <p className="text-xs mt-0.5">
                      <span className={`num font-bold ${Q_COLOR[item.kind]}`}>
                        {item.sign}
                        {formatQuantity(item.qty)} {item.unit}
                      </span>
                      {item.who && <span className="text-[var(--muted)]"> · {item.who}</span>}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* ── PLANS: full-width progress strips ─────────── */}
        <section className="fade-in-up" style={{ animationDelay: "160ms" }}>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-label">Планы</h2>
            <Link href="/dashboard/plans" className="text-xs text-[var(--accent)] hover:underline font-medium">
              Все планы →
            </Link>
          </div>

          {plans.length === 0 ? (
            <div className="py-8 text-center bg-[var(--surface-1)] rounded-xl border border-[var(--border)]">
              <p className="text-sm text-[var(--muted)]">Нет активных планов</p>
              <Link href="/dashboard/plans" className="mt-1 inline-block text-xs text-[var(--accent)] hover:underline">
                Создать план
              </Link>
            </div>
          ) : (
            <div className="space-y-1.5">
              {plans.map((plan) => {
                const overdue = plan.daysLeft < 0;
                const burning = !overdue && plan.daysLeft <= 3;
                return (
                  <Link
                    key={plan.id}
                    href={`/dashboard/plans/${plan.id}`}
                    className="block py-2.5 px-3 -mx-3 rounded-lg hover:bg-[var(--surface-1)] transition-colors tap-scale"
                  >
                    <div className="flex items-baseline justify-between gap-3 mb-1.5">
                      <span className="text-sm font-medium text-[var(--text)] truncate">
                        {plan.name}
                      </span>
                      <span className="flex items-baseline gap-2 shrink-0">
                        {overdue ? (
                          <span className="text-[10px] font-bold uppercase text-[var(--danger)]">
                            просрочен {Math.abs(plan.daysLeft)} дн
                          </span>
                        ) : burning ? (
                          <span className="text-[10px] font-bold uppercase text-[var(--warning)]">
                            ⚠ {plan.daysLeft} дн
                          </span>
                        ) : (
                          <span className="num text-[10px] text-[var(--muted)]">
                            до {fmtDate(plan.end_date)}
                          </span>
                        )}
                        <span
                          className={`num text-sm font-bold ${
                            plan.pct >= 100
                              ? "text-[var(--success)]"
                              : overdue
                              ? "text-[var(--danger)]"
                              : "text-[var(--accent)]"
                          }`}
                        >
                          {Math.min(plan.pct, 999).toFixed(0)}%
                        </span>
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          plan.pct >= 100
                            ? "bg-[var(--success)]"
                            : overdue
                            ? "bg-[var(--danger)]"
                            : "bg-[var(--accent)]"
                        }`}
                        style={{ width: `${Math.min(plan.pct, 100)}%` }}
                      />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
    </>
  );
}
