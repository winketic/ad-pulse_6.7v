"use client";

import { useState, useTransition, useCallback } from "react";
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

// ─── Helpers ──────────────────────────────────────────────

function fmtDate(s: string) {
  const [y, m, d] = s.split("-");
  return `${d}.${m}.${y}`;
}

function fmtQty(n: number) {
  return n === 0 ? "—" : n.toFixed(4);
}

// ─── Export to Excel ──────────────────────────────────────

async function exportExcel(
  summary: SummaryRow[],
  defects: DefectRow[],
  from: string,
  to: string
) {
  const XLSX = await import("xlsx");

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
    { wch: 30 }, // Материал
    { wch: 10 }, // Ед.изм.
    { wch: 14 }, // Приход
    { wch: 14 }, // Возврат
    { wch: 14 }, // Расход
    { wch: 14 }, // Брак
    { wch: 14 }, // Остаток
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
      className="flex flex-wrap items-end gap-3"
    >
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1.5">
          Период с
        </label>
        <input
          type="date"
          name="from"
          defaultValue={from}
          required
          className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1a472a]/40 focus:border-[#1a472a] transition-colors"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1.5">
          по
        </label>
        <input
          type="date"
          name="to"
          defaultValue={to}
          required
          className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1a472a]/40 focus:border-[#1a472a] transition-colors"
        />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="px-5 py-2 rounded-lg bg-[#1a472a] hover:bg-[#163d24] text-white text-sm font-semibold transition-colors disabled:opacity-60 flex items-center gap-2"
      >
        {isPending && (
          <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        Применить
      </button>
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
        <p className="text-sm text-gray-500">Нет данных за выбранный период</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
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
                className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide ${cls}`}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row) => (
            <tr key={row.material_id} className="hover:bg-gray-50/50 transition-colors">
              <td className="px-4 py-3 font-medium text-gray-900">
                {row.material_name}
              </td>
              <td className="px-4 py-3">
                <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-[#1a472a]/10 text-[#1a472a]">
                  {row.unit}
                </span>
              </td>
              <td className="px-4 py-3 text-right tabular-nums font-mono text-green-700">
                {fmtQty(row.income)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums font-mono text-blue-600">
                {fmtQty(row.return_qty)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums font-mono text-red-600">
                {fmtQty(row.expense)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums font-mono text-amber-600">
                {fmtQty(row.defect)}
              </td>
              <td className="px-4 py-3 text-right">
                <span
                  className={`tabular-nums font-mono font-bold ${
                    row.balance > 0
                      ? "text-[#1a472a]"
                      : row.balance < 0
                      ? "text-red-600"
                      : "text-gray-400"
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
            <tr className="border-t-2 border-gray-200 bg-gray-50">
              <td
                colSpan={2}
                className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide"
              >
                Итого
              </td>
              <td className="px-4 py-3 text-right tabular-nums font-mono font-bold text-green-700">
                {totalIncome.toFixed(4)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums font-mono font-bold text-blue-600">
                {totalReturn.toFixed(4)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums font-mono font-bold text-red-600">
                {totalExpense.toFixed(4)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums font-mono font-bold text-amber-600">
                {totalDefect.toFixed(4)}
              </td>
              <td className="px-4 py-3 text-right">
                <span
                  className={`tabular-nums font-mono font-bold ${
                    totalBalance > 0
                      ? "text-[#1a472a]"
                      : totalBalance < 0
                      ? "text-red-600"
                      : "text-gray-400"
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
        <p className="text-sm text-gray-500">Случаев брака за период нет</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
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
                className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide ${cls}`}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-amber-50/30 transition-colors">
              <td className="px-4 py-3 text-gray-500 text-xs tabular-nums whitespace-nowrap">
                {fmtDate(row.transaction_date)}
              </td>
              <td className="px-4 py-3 font-medium text-gray-900">
                {row.material_name}
              </td>
              <td className="px-4 py-3">
                <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-[#1a472a]/10 text-[#1a472a]">
                  {row.material_unit}
                </span>
              </td>
              <td className="px-4 py-3 text-right tabular-nums font-mono font-semibold text-amber-700">
                {row.quantity.toFixed(4)}
              </td>
              <td className="px-4 py-3 text-gray-600 text-xs max-w-xs">
                {row.note ? (
                  <span className="block whitespace-pre-line">{row.note}</span>
                ) : (
                  <span className="text-gray-300">—</span>
                )}
              </td>
              <td className="px-4 py-3 text-gray-500 text-xs">
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
  from,
  to,
}: {
  summary: SummaryRow[];
  defects: DefectRow[];
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
      await exportExcel(summary, defects, from, to);
    } finally {
      setExporting(false);
    }
  };

  const totalDefectQty = defects.reduce((s, d) => s + d.quantity, 0);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Отчёты</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Период:{" "}
            <span className="font-medium text-gray-700">
              {fmtDate(from)} — {fmtDate(to)}
            </span>
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting || summary.length === 0}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border-2 border-[#1a472a] text-[#1a472a] hover:bg-[#1a472a] hover:text-white text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed self-start sm:self-auto"
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
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 mb-5">
        <FilterBar from={from} to={to} onApply={handleApply} isPending={isPending} />
      </div>

      {/* ── Summary table ───────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 mb-4">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">
              Сводная таблица
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Движение по каждому материалу за выбранный период
            </p>
          </div>
          {summary.length > 0 && (
            <span className="text-xs text-gray-400">
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

      {/* ── Defect cases ────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">
              Случаи брака
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Все операции типа «Брак» за период
            </p>
          </div>
          {defects.length > 0 && (
            <div className="text-right">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                {defects.length} случ. · {totalDefectQty.toFixed(2)} ед.
              </span>
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
      <div className="flex flex-wrap gap-4 mt-4 text-xs text-gray-400">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-green-100 border border-green-200" /> Приход
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-blue-100 border border-blue-200" /> Возврат
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-red-100 border border-red-200" /> Расход
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-amber-100 border border-amber-200" /> Брак
        </span>
        <span className="ml-auto text-gray-300">
          Остаток = (Приход + Возврат) − (Расход + Брак)
        </span>
      </div>
    </div>
  );
}
