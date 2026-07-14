"use client";

import { useState, useTransition, useCallback, Fragment } from "react";
import { useRouter } from "next/navigation";

// ─── Types ────────────────────────────────────────────────

export type SummaryRow = {
  material_id: string;
  material_name: string;
  unit: string;
  income: number;
  return_qty: number;
  expense: number;
  defect: number;
  balance: number;
};

export type DefectRow = {
  id: string;
  transaction_date: string;
  material_name: string;
  material_unit: string;
  quantity: number;
  note: string | null;
  creator_name: string;
};

export type AllTxRow = {
  id: string;
  transaction_date: string;
  type: string;
  material_name: string;
  material_unit: string;
  quantity: number;
  note: string | null;
  counterparty: string | null;
  creator_name: string;
};

export type CounterpartyRow = {
  counterparty: string;
  incomeTotal: number;
  expenseTotal: number;
  materials: { material_name: string; unit: string; income: number; expense: number }[];
};

export type ProductionRow = {
  lintel_name: string;
  unit: string;
  produced: number;
  concrete: number;
  rebar: number;
};

// ─── Helpers ──────────────────────────────────────────────

function fmtDate(s: string) {
  const [y, m, d] = s.split("-");
  return `${d}.${m}.${y}`;
}

function fmtQty(n: number) {
  return n === 0 ? "—" : n.toFixed(4);
}

// Compact: up to 2 decimals, no trailing zeros; dash for zero.
function fmt2(n: number) {
  return n === 0 ? "—" : parseFloat(n.toFixed(2)).toString();
}

function pluralCases(n: number) {
  if (n % 10 === 1 && n % 100 !== 11) return "случай";
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100))
    return "случая";
  return "случаев";
}

// Defects can span materials with different units — sum per unit so the
// total stays meaningful instead of adding kg to pieces.
function sumDefectsByUnit(defects: DefectRow[]): string {
  const totals = new Map<string, number>();
  for (const d of defects) {
    totals.set(d.material_unit, (totals.get(d.material_unit) ?? 0) + d.quantity);
  }
  return Array.from(totals.entries())
    .map(([unit, qty]) => `${qty.toFixed(2)} ${unit}`)
    .join(", ");
}

// ─── Export to Excel ──────────────────────────────────────

async function exportExcel(
  summary: SummaryRow[],
  defects: DefectRow[],
  allTransactions: AllTxRow[],
  byCounterparty: CounterpartyRow[],
  production: ProductionRow[],
  concreteUnit: string,
  rebarUnit: string,
  from: string,
  to: string
) {
  const XLSX = await import("xlsx");

  const TYPE_LABELS: Record<string, string> = {
    income: "Приход",
    expense: "Расход",
    return: "Возврат",
    defect: "Брак",
  };

  const wb = XLSX.utils.book_new();

  // Sheet 1: Summary
  const s1Data = summary.map((r) => ({
    "Материал": r.material_name,
    "Ед. изм.": r.unit,
    "Приход": r.income,
    "Возврат": r.return_qty,
    "Расход": r.expense,
    "Брак": r.defect,
    "Остаток": r.balance,
  }));
  const ws1 = XLSX.utils.json_to_sheet(s1Data);
  ws1["!cols"] = [
    { wch: 30 }, { wch: 10 }, { wch: 14 },
    { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, ws1, "Сводная таблица");

  // Sheet 2: Defects
  const s2Data = defects.map((d) => ({
    "Дата": fmtDate(d.transaction_date),
    "Материал": d.material_name,
    "Ед. изм.": d.material_unit,
    "Количество": d.quantity,
    "Причина / Примечание": d.note ?? "—",
    "Добавил": d.creator_name,
  }));
  const ws2 = XLSX.utils.json_to_sheet(
    s2Data.length ? s2Data : [{ "Дата": "Нет данных" }]
  );
  ws2["!cols"] = [
    { wch: 12 }, { wch: 30 }, { wch: 10 },
    { wch: 14 }, { wch: 40 }, { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, ws2, "Случаи брака");

  // Sheet 3: All transactions — include Контрагент only when at least one row has it
  const hasCounterparty = allTransactions.some((tx) => !!tx.counterparty);
  const s3Data = allTransactions.map((tx) => {
    const row: Record<string, string | number> = {
      "Дата": fmtDate(tx.transaction_date),
      "Тип": TYPE_LABELS[tx.type] ?? tx.type,
      "Материал": tx.material_name,
      "Ед. изм.": tx.material_unit,
      "Количество": tx.quantity,
      "Примечание": tx.note ?? "",
      "Добавил": tx.creator_name,
    };
    if (hasCounterparty) row["Контрагент"] = tx.counterparty ?? "";
    return row;
  });
  const ws3 = XLSX.utils.json_to_sheet(
    s3Data.length ? s3Data : [{ "Дата": "Нет данных" }]
  );
  ws3["!cols"] = [
    { wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 10 },
    { wch: 14 }, { wch: 35 }, { wch: 20 },
    ...(hasCounterparty ? [{ wch: 25 }] : []),
  ];
  XLSX.utils.book_append_sheet(wb, ws3, "Движение");

  // Sheet 4: By counterparty — one row per material line + subtotal per cp
  const s4Data: Record<string, string | number>[] = [];
  for (const cp of byCounterparty) {
    for (const m of cp.materials) {
      s4Data.push({
        "Контрагент": cp.counterparty,
        "Материал": m.material_name,
        "Ед. изм.": m.unit,
        "Приход": m.income || "",
        "Расход": m.expense || "",
      });
    }
    s4Data.push({
      "Контрагент": cp.counterparty,
      "Материал": "ИТОГО",
      "Ед. изм.": "",
      "Приход": cp.incomeTotal || "",
      "Расход": cp.expenseTotal || "",
    });
  }
  const ws4 = XLSX.utils.json_to_sheet(s4Data.length ? s4Data : [{ "Контрагент": "Нет данных" }]);
  ws4["!cols"] = [{ wch: 28 }, { wch: 28 }, { wch: 10 }, { wch: 14 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws4, "Контрагенты");

  // Sheet 5: Production — per lintel + total row
  const prodTotals = production.reduce(
    (t, r) => ({ produced: t.produced + r.produced, concrete: t.concrete + r.concrete, rebar: t.rebar + r.rebar }),
    { produced: 0, concrete: 0, rebar: 0 }
  );
  const s5Data: Record<string, string | number>[] = production.map((r) => ({
    "Перемычка": r.lintel_name,
    "Выпущено (шт)": r.produced,
    [`Бетон (${concreteUnit})`]: Number(r.concrete.toFixed(3)),
    [`Арматура (${rebarUnit})`]: Number(r.rebar.toFixed(3)),
  }));
  if (production.length > 0) {
    s5Data.push({
      "Перемычка": "ИТОГО",
      "Выпущено (шт)": prodTotals.produced,
      [`Бетон (${concreteUnit})`]: Number(prodTotals.concrete.toFixed(3)),
      [`Арматура (${rebarUnit})`]: Number(prodTotals.rebar.toFixed(3)),
    });
  }
  const ws5 = XLSX.utils.json_to_sheet(s5Data.length ? s5Data : [{ "Перемычка": "Нет данных" }]);
  ws5["!cols"] = [{ wch: 20 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, ws5, "Производство");

  const filename = `AD_Pulse_${from}_${to}.xlsx`;
  XLSX.writeFile(wb, filename);
}

// ─── Filter bar ───────────────────────────────────────────

function FilterBar({
  from,
  to,
  onApply,
  isPending,
}: {
  from: string;
  to: string;
  onApply: (from: string, to: string) => void;
  isPending: boolean;
}) {
  return (
    // key = forces remount when from/to props change (resets defaultValues)
    <form
      key={`${from}-${to}`}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        onApply(fd.get("from") as string, fd.get("to") as string);
      }}
      className="space-y-3"
    >
      {/* Dates stack full-width on mobile (native date render needs the room),
          side-by-side on sm+ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
            Период с
          </label>
          <input
            type="date"
            name="from"
            defaultValue={from}
            required
            className="field-input w-full min-w-0"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--muted)] mb-1.5">
            по
          </label>
          <input
            type="date"
            name="to"
            defaultValue={to}
            required
            className="field-input w-full min-w-0"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="dp-btn-primary rounded-lg"
        >
          {isPending && (
            <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          Применить
        </button>

        {/* Quick preset */}
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            const now = new Date();
            const first = new Date(now.getFullYear(), now.getMonth(), 1);
            onApply(first.toISOString().split("T")[0], now.toISOString().split("T")[0]);
          }}
          className="dp-btn-secondary rounded-lg"
        >
          Этот месяц
        </button>
      </div>
    </form>
  );
}

// ─── Summary table ────────────────────────────────────────

function SummaryTable({ rows }: { rows: SummaryRow[] }) {
  const totalIncome = rows.reduce((s, r) => s + r.income, 0);
  const totalReturn = rows.reduce((s, r) => s + r.return_qty, 0);
  const totalExpense = rows.reduce((s, r) => s + r.expense, 0);
  const totalDefect = rows.reduce((s, r) => s + r.defect, 0);
  const totalBalance = rows.reduce((s, r) => s + r.balance, 0);

  if (rows.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-[var(--muted)]">Нет данных за выбранный период</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[var(--bg3)] border-b border-[var(--border)]">
            {[
              ["Материал", "text-left"],
              ["Ед.", "text-left w-16"],
              ["Приход", "text-right w-28"],
              ["Возврат", "text-right w-28"],
              ["Расход", "text-right w-28"],
              ["Брак", "text-right w-28"],
              ["Остаток", "text-right w-28"],
            ].map(([label, cls]) => (
              <th
                key={label}
                className={`px-4 py-3 text-xs font-semibold text-[var(--muted)] uppercase tracking-wide ${cls}`}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {rows.map((row) => (
            <tr key={row.material_id} className="hover:bg-[var(--bg3)] transition-colors">
              <td className="px-4 py-3 font-medium text-[var(--text)]">
                {row.material_name}
              </td>
              <td className="px-4 py-3">
                <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--accent)]/10 text-[var(--accent)]">
                  {row.unit}
                </span>
              </td>
              <td className="px-4 py-3 text-right tabular-nums font-mono text-[var(--success)]">
                {fmtQty(row.income)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums font-mono text-[var(--info)]">
                {fmtQty(row.return_qty)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums font-mono text-[var(--danger)]">
                {fmtQty(row.expense)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums font-mono text-[var(--warning)]">
                {fmtQty(row.defect)}
              </td>
              <td className="px-4 py-3 text-right">
                <span
                  className={`tabular-nums font-mono font-bold ${
                    row.balance > 0
                      ? "text-[var(--accent)]"
                      : row.balance < 0
                      ? "text-[var(--danger)]"
                      : "text-[var(--muted)]"
                  }`}
                >
                  {row.balance === 0
                    ? "0"
                    : `${row.balance > 0 ? "+" : ""}${row.balance.toFixed(4)}`}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
        {rows.length > 1 && (
          <tfoot>
            <tr className="border-t-2 border-[var(--border)] bg-[var(--bg3)]">
              <td
                colSpan={2}
                className="px-4 py-3 text-xs font-semibold text-[var(--muted)] uppercase tracking-wide"
              >
                Итого
              </td>
              <td className="px-4 py-3 text-right tabular-nums font-mono font-bold text-[var(--success)]">
                {totalIncome.toFixed(4)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums font-mono font-bold text-[var(--info)]">
                {totalReturn.toFixed(4)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums font-mono font-bold text-[var(--danger)]">
                {totalExpense.toFixed(4)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums font-mono font-bold text-[var(--warning)]">
                {totalDefect.toFixed(4)}
              </td>
              <td className="px-4 py-3 text-right">
                <span
                  className={`tabular-nums font-mono font-bold ${
                    totalBalance > 0
                      ? "text-[var(--accent)]"
                      : totalBalance < 0
                      ? "text-[var(--danger)]"
                      : "text-[var(--muted)]"
                  }`}
                >
                  {totalBalance > 0 ? "+" : ""}
                  {totalBalance.toFixed(4)}
                </span>
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

// ─── Defect table ─────────────────────────────────────────

function DefectTable({ rows }: { rows: DefectRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="py-10 text-center">
        <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center mx-auto mb-2">
          <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        </div>
        <p className="text-sm text-[var(--muted)]">Случаев брака за период нет</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[var(--bg3)] border-b border-[var(--border)]">
            {[
              ["Дата", "text-left w-24"],
              ["Материал", "text-left"],
              ["Ед.", "text-left w-16"],
              ["Количество", "text-right w-28"],
              ["Причина / Примечание", "text-left"],
              ["Добавил", "text-left w-36"],
            ].map(([label, cls]) => (
              <th
                key={label}
                className={`px-4 py-3 text-xs font-semibold text-[var(--muted)] uppercase tracking-wide ${cls}`}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-amber-500/10/30 transition-colors">
              <td className="px-4 py-3 text-[var(--muted)] text-xs tabular-nums whitespace-nowrap">
                {fmtDate(row.transaction_date)}
              </td>
              <td className="px-4 py-3 font-medium text-[var(--text)]">
                {row.material_name}
              </td>
              <td className="px-4 py-3">
                <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--accent)]/10 text-[var(--accent)]">
                  {row.material_unit}
                </span>
              </td>
              <td className="px-4 py-3 text-right tabular-nums font-mono font-semibold text-[var(--warning)]">
                {row.quantity.toFixed(4)}
              </td>
              <td className="px-4 py-3 text-[var(--muted)] text-xs max-w-xs">
                {row.note ? (
                  <span className="block whitespace-pre-line">{row.note}</span>
                ) : (
                  <span className="text-[var(--muted)]">—</span>
                )}
              </td>
              <td className="px-4 py-3 text-[var(--muted)] text-xs">
                {row.creator_name}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────

export default function ReportsClient({
  summary,
  defects,
  allTransactions,
  byCounterparty,
  production,
  concreteUnit,
  rebarUnit,
  from,
  to,
}: {
  summary: SummaryRow[];
  defects: DefectRow[];
  allTransactions: AllTxRow[];
  byCounterparty: CounterpartyRow[];
  production: ProductionRow[];
  concreteUnit: string;
  rebarUnit: string;
  from: string;
  to: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [exporting, setExporting] = useState(false);

  const handleApply = useCallback(
    (newFrom: string, newTo: string) => {
      startTransition(() => {
        const p = new URLSearchParams();
        if (newFrom) p.set("from", newFrom);
        if (newTo) p.set("to", newTo);
        router.push(`/dashboard/reports?${p.toString()}`);
      });
    },
    [router]
  );

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportExcel(
        summary,
        defects,
        allTransactions,
        byCounterparty,
        production,
        concreteUnit,
        rebarUnit,
        from,
        to
      );
    } finally {
      setExporting(false);
    }
  };

  const defectTotalsLabel = sumDefectsByUnit(defects);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-display text-[var(--text)]">Отчёты</h1>
          <p className="text-label mt-1.5">
            <span className="num">{fmtDate(from)} — {fmtDate(to)}</span>
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting || summary.length === 0}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-[var(--accent)]/40 text-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--accent-text)] text-sm font-semibold transition-colors tap-scale disabled:opacity-40 disabled:cursor-not-allowed self-start sm:self-auto min-h-[48px]"
        >
          {exporting ? (
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          )}
          {exporting ? "Экспорт..." : "Экспорт в Excel"}
        </button>
      </div>

      {/* ── Filter ─────────────────────────────────────── */}
      <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] px-5 py-4 mb-5">
        <FilterBar from={from} to={to} onApply={handleApply} isPending={isPending} />
      </div>

      {/* ── Summary table ───────────────────────────────── */}
      <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] mb-4">
        <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text)]">
              Сводная таблица
            </h2>
            <p className="text-xs text-[var(--muted)] mt-0.5">
              Движение по каждому материалу за выбранный период
            </p>
          </div>
          {summary.length > 0 && (
            <span className="text-xs text-[var(--muted)]">
              {summary.length} матер.
            </span>
          )}
        </div>
        <div
          className={isPending ? "opacity-60 pointer-events-none" : ""}
        >
          <SummaryTable rows={summary} />
        </div>
      </div>

      {/* ── By counterparty ─────────────────────────────── */}
      <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] mb-4">
        <div className="px-5 py-4 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold text-[var(--text)]">По контрагентам</h2>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            Приход и расход по каждому контрагенту за период
          </p>
        </div>
        {byCounterparty.length === 0 ? (
          <p className="text-sm text-[var(--muted)] text-center py-10">Нет данных за период</p>
        ) : (
          <div className={`overflow-x-auto ${isPending ? "opacity-60 pointer-events-none" : ""}`}>
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left px-5 h-9 text-xs font-medium text-[var(--muted)]">Контрагент / материал</th>
                  <th className="text-right px-4 h-9 text-xs font-medium text-[var(--muted)] w-40">Приход</th>
                  <th className="text-right px-5 h-9 text-xs font-medium text-[var(--muted)] w-40">Расход</th>
                </tr>
              </thead>
              <tbody>
                {byCounterparty.map((cp) => (
                  <Fragment key={cp.counterparty}>
                    <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]/40">
                      <td className="px-5 py-2 font-semibold text-[var(--text)]">{cp.counterparty}</td>
                      <td className="num px-4 py-2 text-right font-semibold text-[var(--success)]">{fmt2(cp.incomeTotal)}</td>
                      <td className="num px-5 py-2 text-right font-semibold text-[var(--danger)]">{fmt2(cp.expenseTotal)}</td>
                    </tr>
                    {cp.materials.map((m) => (
                      <tr key={cp.counterparty + m.material_name} className="border-b border-[var(--border)] last:border-0">
                        <td className="px-5 py-1.5 pl-8 text-[var(--muted)]">
                          {m.material_name} <span className="text-[var(--muted-2)] text-xs">{m.unit}</span>
                        </td>
                        <td className="num px-4 py-1.5 text-right text-[var(--muted)]">{fmt2(m.income)}</td>
                        <td className="num px-5 py-1.5 text-right text-[var(--muted)]">{fmt2(m.expense)}</td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Production ───────────────────────────────────── */}
      <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] mb-4">
        <div className="px-5 py-4 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold text-[var(--text)]">Производство</h2>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            Выпуск перемычек и списанное сырьё за период
          </p>
        </div>
        {production.length === 0 ? (
          <p className="text-sm text-[var(--muted)] text-center py-10">Нет выпуска за период</p>
        ) : (
          <div className={`overflow-x-auto ${isPending ? "opacity-60 pointer-events-none" : ""}`}>
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left px-5 h-9 text-xs font-medium text-[var(--muted)]">Перемычка</th>
                  <th className="text-right px-4 h-9 text-xs font-medium text-[var(--muted)] w-32">Выпущено</th>
                  <th className="text-right px-4 h-9 text-xs font-medium text-[var(--muted)] w-36">Бетон, {concreteUnit}</th>
                  <th className="text-right px-5 h-9 text-xs font-medium text-[var(--muted)] w-40">Арматура, {rebarUnit}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {production.map((r) => (
                  <tr key={r.lintel_name} className="h-10 hover:bg-[var(--surface-2)] transition-colors">
                    <td className="px-5 text-[var(--text)]">{r.lintel_name}</td>
                    <td className="num px-4 text-right font-semibold text-[var(--info)]">
                      {fmt2(r.produced)} <span className="text-xs font-normal text-[var(--muted)]">{r.unit}</span>
                    </td>
                    <td className="num px-4 text-right text-[var(--muted)]">{fmt2(r.concrete)}</td>
                    <td className="num px-5 text-right text-[var(--muted)]">{fmt2(r.rebar)}</td>
                  </tr>
                ))}
                {(() => {
                  const t = production.reduce(
                    (a, r) => ({ p: a.p + r.produced, c: a.c + r.concrete, r: a.r + r.rebar }),
                    { p: 0, c: 0, r: 0 }
                  );
                  return (
                    <tr className="h-10 bg-[var(--surface-2)]/50 font-semibold">
                      <td className="px-5 text-[var(--text)]">ИТОГО</td>
                      <td className="num px-4 text-right text-[var(--text)]">{fmt2(t.p)} шт</td>
                      <td className="num px-4 text-right text-[var(--text)]">{fmt2(t.c)}</td>
                      <td className="num px-5 text-right text-[var(--text)]">{fmt2(t.r)}</td>
                    </tr>
                  );
                })()}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Defect cases ────────────────────────────────── */}
      <div className="bg-[var(--card)] rounded-xl border border-[var(--border)]">
        <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text)]">
              Случаи брака
            </h2>
            <p className="text-xs text-[var(--muted)] mt-0.5">
              Все операции типа «Брак» за период
            </p>
          </div>
          {defects.length > 0 && (
            <div className="text-right">
              <p className="num-lg leading-none text-[var(--warning)]">
                {defects.length}
              </p>
              <p className="text-xs text-[var(--muted)] mt-0.5">
                {pluralCases(defects.length)} брака
              </p>
              <p className="text-xs text-[var(--muted)] mt-1.5">
                Итого: {defectTotalsLabel}
              </p>
            </div>
          )}
        </div>
        <div
          className={isPending ? "opacity-60 pointer-events-none" : ""}
        >
          <DefectTable rows={defects} />
        </div>
      </div>

      {/* ── Legend ─────────────────────────────────────── */}
      <div className="flex flex-wrap gap-4 mt-4 text-xs text-[var(--muted)]">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-green-500/15 border border-green-500/20 border border-green-200" /> Приход
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-blue-100 border border-blue-200" /> Возврат
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-red-100 border border-red-500/30" /> Расход
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-amber-500/15 border border-amber-500/20 border border-amber-500/30" /> Брак
        </span>
        <span className="ml-auto text-[var(--muted)]">
          Остаток = (Приход + Возврат) − (Расход + Брак)
        </span>
      </div>
    </div>
  );
}
