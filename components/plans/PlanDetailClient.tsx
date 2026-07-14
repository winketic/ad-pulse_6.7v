"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  updatePlanStatus,
  type PlanStatus,
} from "@/app/(dashboard)/dashboard/plans/actions";
import ChangedFooter from "@/components/ui/ChangedFooter";
import type { LastChange } from "@/lib/audit/getLastChange";

// ─── Types ────────────────────────────────────────────────

export type PlanMaterialRow = {
  id: string;
  material_id: string;
  material_name: string;
  material_unit: string;
  planned_quantity: number;
  actual_quantity: number;
  deviation: number; // actual - planned
  pct: number; // actual / planned * 100
};

export type PlanDetail = {
  id: string;
  name: string;
  planned_quantity: number;
  actual_quantity: number;
  start_date: string;
  end_date: string;
  status: PlanStatus;
  created_at: string;
  assignee_name: string | null;
  materials: PlanMaterialRow[];
};

// ─── Config ───────────────────────────────────────────────

const STATUS_CFG: Record<
  PlanStatus,
  { label: string; bg: string; text: string; dot: string }
> = {
  active: {
    label: "Активный",
    bg: "bg-green-500/15 border border-green-500/20",
    text: "text-green-400",
    dot: "bg-green-500",
  },
  completed: {
    label: "Завершён",
    bg: "bg-blue-500/15 border border-blue-500/20",
    text: "text-blue-400",
    dot: "bg-blue-500",
  },
  cancelled: {
    label: "Отменён",
    bg: "bg-[var(--bg3)]",
    text: "text-[var(--muted)]",
    dot: "bg-gray-400",
  },
};

// ─── Helpers ──────────────────────────────────────────────

function fmtDate(s: string) {
  const [y, m, d] = s.split("-");
  return `${d}.${m}.${y}`;
}


// ─── Status Badge ─────────────────────────────────────────

function StatusBadge({ status }: { status: PlanStatus }) {
  const c = STATUS_CFG[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold ${c.bg} ${c.text}`}
    >
      <span className={`w-2 h-2 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

// ─── Stat card ────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "green" | "red" | "neutral";
}) {
  const valueColor =
    accent === "green"
      ? "text-[#00f5c4]"
      : accent === "red"
      ? "text-red-400"
      : "text-[var(--text)]";

  return (
    <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-4">
      <p className="text-xs font-medium text-[var(--muted)] uppercase tracking-wide mb-1">
        {label}
      </p>
      <p className={`text-xl font-bold tabular-nums ${valueColor}`}>{value}</p>
      {sub && <p className="text-xs text-[var(--muted)] mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Material row in table ────────────────────────────────

function MaterialTableRow({ row }: { row: PlanMaterialRow }) {
  const isOver = row.deviation > 0;
  const isZero = row.deviation === 0;
  const pctClamped = Math.min(row.pct, 100);

  return (
    <tr className="hover:bg-[var(--bg3)] transition-colors">
      <td className="px-5 py-3.5 font-medium text-[var(--text)]">
        {row.material_name}
      </td>
      <td className="px-5 py-3.5">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#00f5c4]/10 text-[#00f5c4]">
          {row.material_unit}
        </span>
      </td>
      <td className="px-5 py-3.5 text-right tabular-nums text-sm text-[var(--muted)] font-mono">
        {row.planned_quantity.toFixed(4)}
      </td>
      <td className="px-5 py-3.5 text-right tabular-nums text-sm font-mono font-semibold">
        <span className={isOver ? "text-red-400" : "text-[var(--muted)]"}>
          {row.actual_quantity.toFixed(4)}
        </span>
      </td>
      <td className="px-5 py-3.5 text-right">
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold tabular-nums font-mono ${
            isZero
              ? "bg-[var(--bg3)] text-[var(--muted)]"
              : isOver
              ? "bg-red-100 text-red-400"
              : "bg-green-500/15 border border-green-500/20 text-green-400"
          }`}
        >
          {isZero ? "—" : isOver ? "+" : ""}
          {isZero ? "0" : row.deviation.toFixed(4)}
        </span>
      </td>
      <td className="px-5 py-3.5 min-w-[130px]">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-[var(--bg3)] overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                row.pct > 100
                  ? "bg-red-500"
                  : row.pct >= 75
                  ? "bg-[#00f5c4]"
                  : row.pct > 0
                  ? "bg-[#2d6a4f]"
                  : "bg-gray-200"
              }`}
              style={{ width: `${pctClamped}%` }}
            />
          </div>
          <span
            className={`text-xs tabular-nums font-medium w-10 text-right shrink-0 ${
              row.pct > 100 ? "text-red-400" : "text-[var(--muted)]"
            }`}
          >
            {row.pct.toFixed(0)}%
          </span>
        </div>
      </td>
    </tr>
  );
}

// ─── Mobile material card ─────────────────────────────────

function MaterialMobileCard({ row }: { row: PlanMaterialRow }) {
  const isOver = row.deviation > 0;

  return (
    <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="font-semibold text-[var(--text)] text-sm leading-tight">
          {row.material_name}
        </p>
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#00f5c4]/10 text-[#00f5c4] shrink-0">
          {row.material_unit}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <p className="text-xs text-[var(--muted)] mb-0.5">План</p>
          <p className="text-sm font-semibold text-[var(--muted)] tabular-nums font-mono">
            {row.planned_quantity.toFixed(4)}
          </p>
        </div>
        <div>
          <p className="text-xs text-[var(--muted)] mb-0.5">Факт</p>
          <p
            className={`text-sm font-semibold tabular-nums font-mono ${
              isOver ? "text-red-400" : "text-[var(--muted)]"
            }`}
          >
            {row.actual_quantity.toFixed(4)}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-[var(--muted)]">Отклонение:</span>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums font-mono ${
              row.deviation === 0
                ? "bg-[var(--bg3)] text-[var(--muted)]"
                : isOver
                ? "bg-red-100 text-red-400"
                : "bg-green-500/15 border border-green-500/20 text-green-400"
            }`}
          >
            {row.deviation === 0
              ? "—"
              : `${isOver ? "+" : ""}${row.deviation.toFixed(4)}`}
          </span>
        </div>
        <span
          className={`text-sm font-bold tabular-nums ${
            row.pct > 100 ? "text-red-400" : "text-[#00f5c4]"
          }`}
        >
          {row.pct.toFixed(0)}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="mt-2.5 h-1.5 rounded-full bg-[var(--bg3)] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            row.pct > 100
              ? "bg-red-500"
              : row.pct >= 75
              ? "bg-[#00f5c4]"
              : "bg-[#2d6a4f]"
          }`}
          style={{ width: `${Math.min(row.pct, 100)}%` }}
        />
      </div>
    </div>
  );
}

// ─── Status change panel ──────────────────────────────────

function StatusChangePanel({ plan }: { plan: PlanDetail }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<"complete" | "cancel" | null>(null);
  const [error, setError] = useState("");

  const handleStatusChange = useCallback(
    (status: PlanStatus) => {
      setError("");
      startTransition(async () => {
        try {
          await updatePlanStatus(plan.id, status);
          router.refresh();
          setConfirm(null);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Ошибка изменения статуса");
        }
      });
    },
    [plan.id, router]
  );

  if (plan.status !== "active") return null;

  if (confirm === "complete") {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <p className="text-sm font-medium text-blue-900">
            Завершить план «{plan.name}»?
          </p>
          <p className="text-xs text-blue-400 mt-0.5">
            Статус изменится на «Завершён» и дальнейшие изменения будут ограничены.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => setConfirm(null)}
            disabled={isPending}
            className="px-4 py-2 rounded-lg text-sm border border-blue-500/30 text-blue-400 hover:bg-blue-500/15 border border-blue-500/20 transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={() => handleStatusChange("completed")}
            disabled={isPending}
            className="px-4 py-2 rounded-lg text-sm bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors disabled:opacity-60"
          >
            {isPending ? "..." : "Завершить"}
          </button>
        </div>
      </div>
    );
  }

  if (confirm === "cancel") {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <p className="text-sm font-medium text-red-900">
            Отменить план «{plan.name}»?
          </p>
          <p className="text-xs text-red-400 mt-0.5">
            Это действие нельзя отменить. Статус изменится на «Отменён».
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => setConfirm(null)}
            disabled={isPending}
            className="px-4 py-2 rounded-lg text-sm border border-red-300 text-red-400 hover:bg-red-100 transition-colors"
          >
            Назад
          </button>
          <button
            onClick={() => handleStatusChange("cancelled")}
            disabled={isPending}
            className="px-4 py-2 rounded-lg text-sm bg-red-600 hover:bg-red-700 text-white font-medium transition-colors disabled:opacity-60"
          >
            {isPending ? "..." : "Отменить план"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-[var(--muted)] mr-1">Изменить статус:</span>
      <button
        onClick={() => setConfirm("complete")}
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-blue-200 text-sm font-medium text-blue-400 hover:bg-blue-50 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        Завершить план
      </button>
      <button
        onClick={() => setConfirm("cancel")}
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-red-500/30 text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
        Отменить план
      </button>
      {error && <p className="text-sm text-red-400 w-full mt-1">{error}</p>}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────

export default function PlanDetailClient({
  plan,
  lastChange,
}: {
  plan: PlanDetail;
  lastChange: LastChange | null;
}) {
  // Summary totals
  const totalPlanned = plan.materials.reduce(
    (s, m) => s + m.planned_quantity,
    0
  );
  const totalActual = plan.materials.reduce(
    (s, m) => s + m.actual_quantity,
    0
  );
  const totalDeviation = totalActual - totalPlanned;
  const overallPct =
    totalPlanned > 0 ? (totalActual / totalPlanned) * 100 : 0;

  const overrunCount = plan.materials.filter((m) => m.deviation > 0).length;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* ── Back ────────────────────────────────────────── */}
      <Link
        href="/dashboard/plans"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-[#00f5c4] transition-colors mb-5"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        К списку планов
      </Link>

      {/* ── Header ─────────────────────────────────────── */}
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <StatusBadge status={plan.status} />
          <span className="text-sm text-[var(--muted)]">
            {fmtDate(plan.start_date)} — {fmtDate(plan.end_date)}
          </span>
          {plan.assignee_name && (
            <span className="text-sm text-[var(--muted)]">
              Исполнитель: <span className="text-[var(--text)] font-medium">{plan.assignee_name}</span>
            </span>
          )}
        </div>
        <h1 className="text-2xl font-bold text-[var(--text)]">{plan.name}</h1>
      </div>

      {/* ── Summary cards ───────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Плановый расход"
          value={totalPlanned.toFixed(2)}
          sub="совокупный по всем материалам"
        />
        <StatCard
          label="Фактический расход"
          value={totalActual.toFixed(2)}
          accent={
            totalActual > totalPlanned
              ? "red"
              : totalActual > 0
              ? "green"
              : "neutral"
          }
          sub="из транзакций за период"
        />
        <StatCard
          label="Общее отклонение"
          value={
            totalDeviation === 0
              ? "0"
              : `${totalDeviation > 0 ? "+" : ""}${totalDeviation.toFixed(2)}`
          }
          accent={
            totalDeviation > 0
              ? "red"
              : totalDeviation < 0
              ? "green"
              : "neutral"
          }
          sub={totalDeviation > 0 ? "перерасход" : totalDeviation < 0 ? "экономия" : "точно по плану"}
        />
        <StatCard
          label="Выполнение"
          value={`${overallPct.toFixed(0)}%`}
          accent={
            overallPct > 100 ? "red" : overallPct > 0 ? "green" : "neutral"
          }
          sub={
            overrunCount > 0
              ? `${overrunCount} материал${overrunCount === 1 ? "" : overrunCount < 5 ? "а" : "ов"} в перерасходе`
              : "все в норме"
          }
        />
      </div>

      {/* ── Status change ───────────────────────────────── */}
      {plan.status === "active" && (
        <div className="mb-6">
          <StatusChangePanel plan={plan} />
        </div>
      )}

      {/* ── Materials section ───────────────────────────── */}
      <div className="bg-[var(--card)] rounded-xl border border-[var(--border)]">
        <div className="px-5 py-4 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold text-[var(--text)]">
            Материалы плана
          </h2>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            Фактический расход рассчитан из транзакций типа «Расход» и «Брак»
            за период плана
          </p>
        </div>

        {plan.materials.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-[var(--muted)]">Материалы не добавлены</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[var(--bg3)] border-b border-[var(--border)]">
                    {[
                      ["Материал", ""],
                      ["Ед. изм.", "w-24"],
                      ["Плановый расход", "w-36 text-right"],
                      ["Фактический расход", "w-36 text-right"],
                      ["Отклонение", "w-36 text-right"],
                      ["% выполнения", "w-40"],
                    ].map(([label, cls]) => (
                      <th
                        key={label}
                        className={`px-5 py-3 text-left text-xs font-semibold text-[var(--muted)] uppercase tracking-wide ${cls}`}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {plan.materials.map((row) => (
                    <MaterialTableRow key={row.id} row={row} />
                  ))}
                </tbody>
                {/* Totals row */}
                {plan.materials.length > 1 && (
                  <tfoot>
                    <tr className="bg-[var(--bg3)] border-t-2 border-[var(--border)]">
                      <td
                        colSpan={2}
                        className="px-5 py-3 text-xs font-semibold text-[var(--muted)] uppercase tracking-wide"
                      >
                        Итого
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums font-bold text-[var(--text)] font-mono text-sm">
                        {totalPlanned.toFixed(4)}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums font-bold font-mono text-sm">
                        <span
                          className={
                            totalActual > totalPlanned
                              ? "text-red-400"
                              : "text-[var(--text)]"
                          }
                        >
                          {totalActual.toFixed(4)}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold tabular-nums font-mono ${
                            totalDeviation === 0
                              ? "bg-[var(--bg3)] text-[var(--muted)]"
                              : totalDeviation > 0
                              ? "bg-red-100 text-red-400"
                              : "bg-green-500/15 border border-green-500/20 text-green-400"
                          }`}
                        >
                          {totalDeviation === 0
                            ? "—"
                            : `${totalDeviation > 0 ? "+" : ""}${totalDeviation.toFixed(4)}`}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`text-sm font-bold tabular-nums ${
                            overallPct > 100 ? "text-red-400" : "text-[#00f5c4]"
                          }`}
                        >
                          {overallPct.toFixed(0)}%
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden p-4 space-y-3">
              {plan.materials.map((row) => (
                <MaterialMobileCard key={row.id} row={row} />
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Legend ─────────────────────────────────────── */}
      <div className="flex flex-wrap gap-4 mt-4 text-xs text-[var(--muted)]">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-green-500/15 border border-green-500/20 border border-green-200 inline-block" />
          Отклонение ≤ 0 — экономия / в норме
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-red-100 border border-red-500/30 inline-block" />
          Отклонение &gt; 0 — перерасход
        </span>
      </div>

      <ChangedFooter change={lastChange} />
    </div>
  );
}
