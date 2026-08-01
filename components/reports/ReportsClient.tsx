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

export type FinanceData = {
  revenueByCounterparty: { counterparty: string; revenue: number }[];
  revenueTotal: number;
  rawCostByMaterial: { material_name: string; unit: string; qty: number; cost: number }[];
  rawCostTotal: number;
  productionRawCost: number;
  materialMargin: number;
  hasAnyPrice: boolean;
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

// Деньги (тг) — целые с разделителями тысяч. NaN/пусто → 0.
function money(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return Math.round(v).toLocaleString("ru-RU") + " тг";
}

// ─── Mobile card primitives (label: value row) ────────────
// Каждая строка таблицы = карточка; поля идут вертикально, 2 колонки внутри.
// Только вертикальный скролл — никакого горизонтального переполнения.
function CardField({
  label,
  value,
  cls = "text-[var(--text)]",
  full = false,
}: {
  label: string;
  value: string;
  cls?: string;
  full?: boolean;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-2 min-w-0 ${full ? "col-span-2" : ""}`}>
      <span className="text-xs text-[var(--muted)] shrink-0">{label}</span>
      <span className={`tabular-nums font-mono text-sm truncate ${cls}`}>{value}</span>
    </div>
  );
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
  finance: FinanceData,
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

  // Sheet 6: Финансы — выручка по контрагентам, затраты на сырьё, маржа
  const s6Data: Record<string, string | number>[] = [];
  s6Data.push({ "Показатель": "ВЫРУЧКА (расход / отгрузка продукции)", "Сумма, тг": "" });
  for (const r of finance.revenueByCounterparty) {
    s6Data.push({ "Показатель": `  ${r.counterparty}`, "Сумма, тг": Math.round(r.revenue) });
  }
  s6Data.push({ "Показатель": "Выручка — ИТОГО", "Сумма, тг": Math.round(finance.revenueTotal) });
  s6Data.push({ "Показатель": "", "Сумма, тг": "" });
  s6Data.push({ "Показатель": "ЗАТРАТЫ НА СЫРЬЁ (приход сырья)", "Сумма, тг": "" });
  for (const r of finance.rawCostByMaterial) {
    s6Data.push({ "Показатель": `  ${r.material_name}`, "Сумма, тг": Math.round(r.cost) });
  }
  s6Data.push({ "Показатель": "Затраты на сырьё — ИТОГО", "Сумма, тг": Math.round(finance.rawCostTotal) });
  s6Data.push({ "Показатель": "", "Сумма, тг": "" });
  s6Data.push({ "Показатель": "Стоимость списанного в производстве сырья", "Сумма, тг": Math.round(finance.productionRawCost) });
  s6Data.push({ "Показатель": "МАРЖА ПО МАТЕРИАЛАМ (без зарплат, энергии, амортизации — НЕ чистая прибыль)", "Сумма, тг": Math.round(finance.materialMargin) });
  const ws6 = XLSX.utils.json_to_sheet(s6Data);
  ws6["!cols"] = [{ wch: 68 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws6, "Финансы");

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

  const balColor = (b: number) =>
    b > 0 ? "text-[var(--accent)]" : b < 0 ? "text-[var(--danger)]" : "text-[var(--muted)]";
  const balStr = (b: number) => (b === 0 ? "0" : `${b > 0 ? "+" : ""}${parseFloat(b.toFixed(4))}`);

  return (
    <>
    {/* Desktop table */}
    <div className="hidden md:block overflow-x-auto">
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
                <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-[#00f5c4]/10 text-[#00f5c4]">
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
                      ? "text-[#00f5c4]"
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
                      ? "text-[#00f5c4]"
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

    {/* Mobile cards */}
    <div className="md:hidden divide-y divide-[var(--border)]">
      {rows.map((row) => (
        <div key={row.material_id} className="px-4 py-3">
          <div className="flex items-center justify-between gap-2 mb-2 min-w-0">
            <span className="font-medium text-[var(--text)] truncate">{row.material_name}</span>
            <span className="inline-flex shrink-0 px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--accent)]/10 text-[var(--accent)]">
              {row.unit}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            <CardField label="Приход" value={fmtQty(row.income)} cls="text-[var(--success)]" />
            <CardField label="Возврат" value={fmtQty(row.return_qty)} cls="text-[var(--info)]" />
            <CardField label="Расход" value={fmtQty(row.expense)} cls="text-[var(--danger)]" />
            <CardField label="Брак" value={fmtQty(row.defect)} cls="text-[var(--warning)]" />
            <CardField label="Остаток" value={balStr(row.balance)} cls={`font-bold ${balColor(row.balance)}`} full />
          </div>
        </div>
      ))}
      {rows.length > 1 && (
        <div className="px-4 py-3 bg-[var(--bg3)]">
          <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">Итого</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            <CardField label="Приход" value={totalIncome.toFixed(2)} cls="font-bold text-[var(--success)]" />
            <CardField label="Возврат" value={totalReturn.toFixed(2)} cls="font-bold text-[var(--info)]" />
            <CardField label="Расход" value={totalExpense.toFixed(2)} cls="font-bold text-[var(--danger)]" />
            <CardField label="Брак" value={totalDefect.toFixed(2)} cls="font-bold text-[var(--warning)]" />
            <CardField label="Остаток" value={balStr(totalBalance)} cls={`font-bold ${balColor(totalBalance)}`} full />
          </div>
        </div>
      )}
    </div>
    </>
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
    <>
    {/* Desktop table */}
    <div className="hidden md:block overflow-x-auto">
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
                <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-[#00f5c4]/10 text-[#00f5c4]">
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

    {/* Mobile cards */}
    <div className="md:hidden divide-y divide-[var(--border)]">
      {rows.map((row) => (
        <div key={row.id} className="px-4 py-3">
          <div className="flex items-center justify-between gap-2 mb-1.5 min-w-0">
            <span className="font-medium text-[var(--text)] truncate">{row.material_name}</span>
            <span className="text-xs text-[var(--muted)] tabular-nums shrink-0">{fmtDate(row.transaction_date)}</span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-1.5">
            <CardField label="Количество" value={`${row.quantity.toFixed(2)} ${row.material_unit}`} cls="font-semibold text-[var(--warning)]" />
            <CardField label="Добавил" value={row.creator_name} cls="text-[var(--muted)]" />
          </div>
          {row.note && (
            <p className="text-xs text-[var(--muted)] whitespace-pre-line break-words">
              {row.note}
            </p>
          )}
        </div>
      ))}
    </div>
    </>
  );
}

// ─── Main Component ───────────────────────────────────────

export default function ReportsClient({
  summary,
  defects,
  allTransactions,
  byCounterparty,
  production,
  finance,
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
  finance: FinanceData;
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
        finance,
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

      {/* ── Финансы за период ───────────────────────────── */}
      <div className={`bg-[var(--card)] rounded-xl border border-[var(--border)] mb-4 ${isPending ? "opacity-60 pointer-events-none" : ""}`}>
        <div className="px-5 py-4 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold text-[var(--text)]">Финансы за период</h2>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            Выручка, затраты на сырьё и маржа по материалам
          </p>
        </div>

        {!finance.hasAnyPrice ? (
          <p className="text-sm text-[var(--muted)] text-center py-8 px-5">
            Укажите цены в транзакциях (приход сырья и отгрузка продукции) —
            здесь появятся выручка и маржа.
          </p>
        ) : (
          <div className="p-4 sm:p-5 space-y-5">
            {/* 3 stat tiles */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-lg border border-[var(--border)] bg-[var(--bg3)] px-4 py-3">
                <p className="text-xs text-[var(--muted)]">Выручка</p>
                <p className="num text-lg font-bold text-[var(--success)] mt-1 tabular-nums break-words">
                  {money(finance.revenueTotal)}
                </p>
                <p className="text-[11px] text-[var(--muted-2)] mt-0.5">расход / отгрузка продукции</p>
              </div>
              <div className="rounded-lg border border-[var(--border)] bg-[var(--bg3)] px-4 py-3">
                <p className="text-xs text-[var(--muted)]">Затраты на сырьё</p>
                <p className="num text-lg font-bold text-[var(--danger)] mt-1 tabular-nums break-words">
                  {money(finance.rawCostTotal)}
                </p>
                <p className="text-[11px] text-[var(--muted-2)] mt-0.5">приход сырья</p>
              </div>
              <div className="rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/5 px-4 py-3">
                <p className="text-xs text-[var(--muted)]">Маржа по материалам</p>
                <p className={`num text-lg font-bold mt-1 tabular-nums break-words ${finance.materialMargin >= 0 ? "text-[var(--accent)]" : "text-[var(--danger)]"}`}>
                  {money(finance.materialMargin)}
                </p>
                <p className="text-[11px] text-[var(--muted-2)] mt-0.5">выручка − списанное сырьё</p>
              </div>
            </div>

            {/* Выручка по контрагентам */}
            {finance.revenueByCounterparty.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
                  Выручка по контрагентам
                </p>
                <div className="rounded-lg border border-[var(--border)] divide-y divide-[var(--border)]">
                  {finance.revenueByCounterparty.map((r) => (
                    <div key={r.counterparty} className="flex items-center justify-between gap-2 px-3.5 py-2 min-w-0">
                      <span className="text-sm text-[var(--text)] truncate">{r.counterparty}</span>
                      <span className="num text-sm font-semibold text-[var(--success)] tabular-nums shrink-0">
                        {money(r.revenue)}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-2 px-3.5 py-2 bg-[var(--bg3)]">
                    <span className="text-sm font-semibold text-[var(--text)]">Итого</span>
                    <span className="num text-sm font-bold text-[var(--success)] tabular-nums shrink-0">
                      {money(finance.revenueTotal)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Затраты на сырьё по материалам */}
            {finance.rawCostByMaterial.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">
                  Затраты на сырьё
                </p>
                <div className="rounded-lg border border-[var(--border)] divide-y divide-[var(--border)]">
                  {finance.rawCostByMaterial.map((r) => (
                    <div key={r.material_name} className="flex items-center justify-between gap-2 px-3.5 py-2 min-w-0">
                      <span className="text-sm text-[var(--text)] truncate">
                        {r.material_name} <span className="text-xs text-[var(--muted-2)]">{r.unit}</span>
                      </span>
                      <span className="num text-sm font-semibold text-[var(--danger)] tabular-nums shrink-0">
                        {money(r.cost)}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-2 px-3.5 py-2 bg-[var(--bg3)]">
                    <span className="text-sm font-semibold text-[var(--text)]">Итого</span>
                    <span className="num text-sm font-bold text-[var(--danger)] tabular-nums shrink-0">
                      {money(finance.rawCostTotal)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Пояснение к марже */}
            <p className="text-xs text-[var(--muted-2)] leading-relaxed">
              Маржа по материалам = выручка − стоимость списанного в производстве сырья
              ({money(finance.productionRawCost)}). Считается <b>без учёта зарплат, энергии,
              амортизации</b> — это <b>не чистая прибыль</b>.
            </p>
          </div>
        )}
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
          <div className={isPending ? "opacity-60 pointer-events-none" : ""}>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
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
          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-[var(--border)]">
            {byCounterparty.map((cp) => (
              <div key={cp.counterparty} className="px-4 py-3">
                <p className="font-semibold text-[var(--text)] truncate mb-2">{cp.counterparty}</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-2">
                  <CardField label="Приход" value={fmt2(cp.incomeTotal)} cls="font-semibold text-[var(--success)]" />
                  <CardField label="Расход" value={fmt2(cp.expenseTotal)} cls="font-semibold text-[var(--danger)]" />
                </div>
                {cp.materials.length > 0 && (
                  <div className="space-y-1 border-t border-[var(--border)] pt-2">
                    {cp.materials.map((m) => (
                      <div key={m.material_name} className="flex items-baseline justify-between gap-2 text-xs min-w-0">
                        <span className="text-[var(--muted)] truncate">
                          {m.material_name} <span className="text-[var(--muted-2)]">{m.unit}</span>
                        </span>
                        <span className="shrink-0 tabular-nums font-mono">
                          <span className="text-[var(--success)]">{fmt2(m.income)}</span>
                          <span className="text-[var(--muted-2)]"> / </span>
                          <span className="text-[var(--danger)]">{fmt2(m.expense)}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
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
          <div className={isPending ? "opacity-60 pointer-events-none" : ""}>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
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
          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-[var(--border)]">
            {production.map((r) => (
              <div key={r.lintel_name} className="px-4 py-3">
                <p className="font-medium text-[var(--text)] truncate mb-2">{r.lintel_name}</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  <CardField label="Выпущено" value={`${fmt2(r.produced)} ${r.unit}`} cls="font-semibold text-[var(--info)]" />
                  <CardField label={`Бетон, ${concreteUnit}`} value={fmt2(r.concrete)} cls="text-[var(--muted)]" />
                  <CardField label={`Арматура, ${rebarUnit}`} value={fmt2(r.rebar)} cls="text-[var(--muted)]" />
                </div>
              </div>
            ))}
            {(() => {
              const t = production.reduce(
                (a, r) => ({ p: a.p + r.produced, c: a.c + r.concrete, r: a.r + r.rebar }),
                { p: 0, c: 0, r: 0 }
              );
              return (
                <div className="px-4 py-3 bg-[var(--bg3)]">
                  <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">Итого</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    <CardField label="Выпущено" value={`${fmt2(t.p)} шт`} cls="font-bold text-[var(--text)]" />
                    <CardField label={`Бетон, ${concreteUnit}`} value={fmt2(t.c)} cls="font-bold text-[var(--text)]" />
                    <CardField label={`Арматура, ${rebarUnit}`} value={fmt2(t.r)} cls="font-bold text-[var(--text)]" />
                  </div>
                </div>
              );
            })()}
          </div>
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
