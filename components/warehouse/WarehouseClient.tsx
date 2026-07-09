"use client";

import { useState, useTransition, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setInitialStock } from "@/app/(dashboard)/dashboard/warehouse/actions";
import { createTransaction } from "@/app/(dashboard)/dashboard/transactions/actions";
import type { WarehouseMaterial } from "@/app/(dashboard)/dashboard/warehouse/page";
import { formatCompact, formatQuantity } from "@/lib/utils/format";
import { useToast } from "@/components/ui/Toast";

// ─── Stock level ──────────────────────────────────────────
// critical ≤ min threshold, low ≤ 2×min, else normal.
// No threshold → critical only at ≤0.
type StockLevel = "normal" | "low" | "critical";

// Level warnings apply only to raw materials (сырьё). Finished products
// (перемычки) live at 0 most of the time — that's normal, not critical.
function stockLevel(m: { balance: number; threshold: number | null; isProduct: boolean }): StockLevel {
  if (m.isProduct) return "normal";
  if (m.threshold != null && m.threshold > 0) {
    if (m.balance <= m.threshold) return "critical";
    if (m.balance <= m.threshold * 2) return "low";
    return "normal";
  }
  return m.balance <= 0 ? "critical" : "normal";
}

const LEVEL_ORDER: Record<StockLevel, number> = { critical: 0, low: 1, normal: 2 };

const TILE_STYLE: Record<StockLevel, { tile: string; num: string; label: string | null; labelCls: string }> = {
  critical: {
    tile: "bg-[var(--danger-bg)] border-[var(--danger)]/40",
    num: "text-[var(--danger)]",
    label: "КРИТИЧНО",
    labelCls: "text-[var(--danger)]",
  },
  low: {
    tile: "bg-[var(--warning-bg)] border-[var(--warning)]/35",
    num: "text-[var(--warning)]",
    label: "МАЛО",
    labelCls: "text-[var(--warning)]",
  },
  normal: {
    tile: "bg-[var(--surface-1)] border-[var(--border)]",
    num: "text-[var(--text)]",
    label: null,
    labelCls: "",
  },
};

const TX_LABEL: Record<string, { label: string; cls: string; sign: string }> = {
  income: { label: "приход", cls: "text-[var(--success)]", sign: "+" },
  return: { label: "возврат", cls: "text-[var(--info)]", sign: "+" },
  expense: { label: "расход", cls: "text-[var(--danger)]", sign: "−" },
  defect: { label: "брак", cls: "text-[var(--warning)]", sign: "−" },
};

function fmtDate(s: string) {
  const [, m, d] = s.split("-");
  return `${d}.${m}`;
}

// ─── Bottom sheet: material detail ────────────────────────

function MaterialSheet({
  material,
  onClose,
  onEnterStock,
}: {
  material: WarehouseMaterial;
  onClose: () => void;
  onEnterStock: () => void;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", h);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const level = stockLevel(material);
  const s = TILE_STYLE[level];

  return (
    <div className="fixed inset-0 z-[70]">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        className="absolute bottom-0 left-0 right-0 rounded-t-2xl bg-[var(--surface-2)] border-t border-[var(--border-strong)]"
        style={{
          paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))",
          animation: "slideUpSheet 240ms var(--ease-out) both",
        }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-9 h-1 rounded-full bg-[var(--border-strong)]" />
        </div>

        {/* Header: name + big balance */}
        <div className="px-5 pt-1 pb-3">
          <p className="text-label">{material.name}</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className={`num text-4xl font-bold tracking-tighter ${s.num}`}>
              {formatCompact(material.balance)}
            </span>
            <span className="text-sm text-[var(--muted)]">{material.unit}</span>
            {s.label && (
              <span className={`text-[10px] font-bold tracking-wider ${s.labelCls}`}>{s.label}</span>
            )}
          </div>
          {material.threshold != null && material.threshold > 0 && (
            <p className="num text-[11px] text-[var(--muted-2)] mt-1">
              порог: {formatQuantity(material.threshold)} {material.unit}
            </p>
          )}
        </div>

        {/* Recent movements */}
        <div className="px-5 pb-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-2)] mb-1.5">
            Последние движения
          </p>
          {material.recent.length === 0 ? (
            <p className="text-xs text-[var(--muted)] py-2">Движений ещё не было</p>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {material.recent.map((tx, i) => {
                const t = TX_LABEL[tx.type] ?? TX_LABEL.expense;
                return (
                  <div key={i} className="flex items-center justify-between py-1.5">
                    <span className="text-xs text-[var(--muted)]">
                      <span className="num">{fmtDate(tx.date)}</span> · {t.label}
                    </span>
                    <span className={`num text-xs font-bold ${t.cls}`}>
                      {t.sign}
                      {formatQuantity(tx.qty)} {material.unit}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick adjust: add / remove N units right from the sheet */}
        <QuickAdjust material={material} />

        {/* Secondary actions */}
        <div className="flex items-center justify-between px-5 pt-2">
          <Link
            href={`/dashboard/transactions?material_id=${material.id}`}
            className="text-xs font-medium text-[var(--accent)] hover:underline py-2"
          >
            Вся история →
          </Link>
          <button
            onClick={onEnterStock}
            className="text-xs font-medium text-[var(--muted)] hover:text-[var(--text)] transition-colors py-2"
          >
            Ввести начальный остаток
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Quick adjust: ± N from the warehouse sheet ───────────
// Creates a regular income/expense transaction via the existing action.

function QuickAdjust({ material }: { material: WarehouseMaterial }) {
  const router = useRouter();
  const { toast } = useToast();
  const [qty, setQty] = useState("");
  const [isPending, startTransition] = useTransition();

  const n = parseFloat(qty);
  const valid = !isNaN(n) && n > 0;

  const submit = (type: "income" | "expense") => {
    if (!valid || isPending) return;
    startTransition(async () => {
      try {
        await createTransaction({
          type,
          material_id: material.id,
          quantity: n,
          note: "Корректировка со склада",
          counterparty: null,
          transaction_date: new Date().toISOString().split("T")[0],
        });
        toast(
          `✓ ${type === "income" ? "+" : "−"}${formatQuantity(n)} ${material.unit} — ${material.name}`,
          "success"
        );
        setQty("");
        router.refresh();
      } catch (err) {
        toast(err instanceof Error ? err.message : "Ошибка записи", "error");
      }
    });
  };

  return (
    <div className="px-5 pt-1">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-2)] mb-1.5">
        Быстрая корректировка
      </p>
      <div className="flex gap-2">
        <input
          type="number"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          placeholder="0"
          min="0.0001"
          step="0.0001"
          inputMode="decimal"
          className="field-input num flex-1 min-w-0"
          style={{ height: "48px" }}
        />
        <button
          type="button"
          onClick={() => submit("expense")}
          disabled={!valid || isPending}
          className="dp-btn-danger rounded-xl px-4 shrink-0"
          style={{ minHeight: "48px" }}
        >
          − Убрать
        </button>
        <button
          type="button"
          onClick={() => submit("income")}
          disabled={!valid || isPending}
          className="dp-btn-primary rounded-xl px-4 shrink-0"
          style={{ minHeight: "48px" }}
        >
          + Добавить
        </button>
      </div>
    </div>
  );
}

// ─── Stock entry modal (unchanged flow) ───────────────────

function StockModal({
  material,
  onClose,
}: {
  material: WarehouseMaterial;
  onClose: () => void;
}) {
  const [qty, setQty] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", h);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const n = parseFloat(qty);
    if (!qty || isNaN(n) || n <= 0) {
      setError("Введите корректное количество больше нуля");
      return;
    }
    startTransition(async () => {
      try {
        await setInitialStock(material.id, n);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка сохранения");
      }
    });
  };

  return (
    <div className="fixed inset-0 h-[100dvh] z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[var(--surface-1)] w-full sm:max-w-sm sm:rounded-2xl shadow-2xl z-10 flex flex-col rounded-t-2xl"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="flex items-center justify-between px-4 shrink-0 border-b border-[var(--border)]" style={{ minHeight: "56px" }}>
          <div className="min-w-0 flex-1 mr-3">
            <h2 className="text-base font-semibold text-[var(--text)] truncate">Ввести остаток</h2>
            <p className="text-xs text-[var(--muted)] truncate">{material.name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--surface-2)] text-[var(--muted)] transition-colors shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="text-label block mb-2">
              Количество ({material.unit}) <span className="text-[var(--danger)]">*</span>
            </label>
            <input
              type="number"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="0.00"
              min="0.0001"
              step="0.0001"
              autoFocus
              inputMode="decimal"
              className="field-input num"
            />
            <p className="num mt-1.5 text-xs text-[var(--muted)]">
              Текущий остаток: {material.balance.toFixed(2)} {material.unit}
            </p>
          </div>

          <div className="p-3 rounded-lg bg-[var(--surface-2)] border border-[var(--border)]">
            <p className="text-xs text-[var(--muted)]">
              Создаёт транзакцию <span className="font-medium text-[var(--text)]">«Приход»</span> с примечанием «Начальный остаток».
            </p>
          </div>

          {error && (
            <div className="px-3 py-2.5 rounded-lg bg-[var(--danger-bg)] border border-[var(--danger)]/25 text-sm text-[var(--danger)]">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button type="button" onClick={onClose} disabled={isPending} className="dp-btn-secondary flex-1 rounded-xl">
              Отмена
            </button>
            <button type="submit" disabled={isPending || !qty || Number(qty) <= 0} className="dp-btn-primary flex-1 rounded-xl">
              {isPending ? "Сохранение..." : "Сохранить"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Week sparkline (desktop table) ───────────────────────

function WeekSparkline({ week }: { week: number[] }) {
  if (week.every((d) => d === 0)) {
    return <span className="text-xs text-[var(--muted-2)]">—</span>;
  }
  const max = Math.max(...week.map(Math.abs), 1);
  return (
    <span className="flex items-end gap-[3px] h-4" aria-hidden>
      {week.map((d, i) => (
        <span
          key={i}
          className={`w-1 rounded-[1px] ${
            d === 0 ? "bg-[var(--surface-3)]" : d > 0 ? "bg-[var(--success)]" : "bg-[var(--danger)]"
          }`}
          style={{ height: d === 0 ? "3px" : `${Math.max(3, (Math.abs(d) / max) * 16)}px` }}
        />
      ))}
    </span>
  );
}

// ─── Main: heatmap tiles (mobile) / table (desktop) ───────

type SortKey = "status" | "name" | "balance";

export default function WarehouseClient({
  materials,
}: {
  materials: WarehouseMaterial[];
}) {
  const [sheetMaterial, setSheetMaterial] = useState<WarehouseMaterial | null>(null);
  const [stockMaterial, setStockMaterial] = useState<WarehouseMaterial | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [sortAsc, setSortAsc] = useState(true);

  // Raw materials (Бетон/Арматура/Проволока…) first — that's where the
  // level warnings live; inside: critical → low → normal, then by name.
  // Finished products follow, alphabetically.
  const sorted = useMemo(
    () =>
      [...materials].sort((a, b) => {
        if (a.isProduct !== b.isProduct) return a.isProduct ? 1 : -1;
        const la = LEVEL_ORDER[stockLevel(a)];
        const lb = LEVEL_ORDER[stockLevel(b)];
        if (la !== lb) return la - lb;
        return a.name.localeCompare(b.name, "ru", { numeric: true });
      }),
    [materials]
  );

  // Desktop table sort — click a header to re-sort
  const tableSorted = useMemo(() => {
    if (sortKey === "status") return sortAsc ? sorted : [...sorted].reverse();
    const arr = [...materials].sort((a, b) => {
      const cmp =
        sortKey === "name"
          ? a.name.localeCompare(b.name, "ru", { numeric: true })
          : a.balance - b.balance;
      return sortAsc ? cmp : -cmp;
    });
    return arr;
  }, [materials, sorted, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const sortArrow = (key: SortKey) =>
    sortKey === key ? (sortAsc ? " ↑" : " ↓") : "";

  const criticalCount = sorted.filter((m) => stockLevel(m) === "critical").length;

  return (
    <div className="p-4 sm:p-6 max-w-5xl lg:max-w-6xl mx-auto">
      {/* Header — mobile: display; desktop: calm context strip */}
      <div className="mb-4 lg:hidden">
        <h1 className="text-display text-[var(--text)]">Склад</h1>
        <p className="text-label mt-1.5">
          {materials.length} позиц{materials.length === 1 ? "ия" : materials.length < 5 ? "ии" : "ий"}
          {criticalCount > 0 && (
            <span className="text-[var(--danger)]"> · {criticalCount} критично</span>
          )}
        </p>
      </div>
      <div className="hidden lg:flex items-baseline justify-between mb-5">
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-semibold text-[var(--text)]">Склад</h1>
          <p className="text-sm text-[var(--muted)]">
            {materials.length} позиц{materials.length === 1 ? "ия" : materials.length < 5 ? "ии" : "ий"}
            {criticalCount > 0 && (
              <span className="text-[var(--danger)]"> · {criticalCount} критично</span>
            )}
          </p>
        </div>
      </div>

      {materials.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[var(--surface-2)] flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-[var(--muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <p className="text-sm font-medium text-[var(--text)]">Справочник материалов пуст</p>
          <p className="text-xs text-[var(--muted)] mt-1">
            Добавьте материалы в{" "}
            <Link href="/dashboard/materials" className="text-[var(--accent)] hover:underline">
              справочник
            </Link>
          </p>
        </div>
      ) : (
        <>
        {/* Mobile heatmap tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 lg:hidden">
          {sorted.map((m, i) => {
            const level = stockLevel(m);
            const s = TILE_STYLE[level];
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setSheetMaterial(m)}
                className={`text-left p-4 rounded-2xl border min-h-[112px] flex flex-col justify-between transition-colors tap-scale fade-in-up ${s.tile}`}
                style={{ animationDelay: `${Math.min(i * 30, 300)}ms`, WebkitTapHighlightColor: "transparent" }}
              >
                <p className="text-label leading-tight" title={m.name}>
                  {m.name}
                </p>
                <div>
                  <p className={`num text-2xl font-bold leading-none tracking-tight ${s.num}`}>
                    {formatCompact(m.balance)}
                  </p>
                  <p className="flex items-baseline gap-1.5 mt-1">
                    <span className="text-[11px] text-[var(--muted)]">{m.unit}</span>
                    {s.label && (
                      <span className={`text-[9px] font-bold tracking-wider ${s.labelCls}`}>
                        {s.label}
                      </span>
                    )}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Desktop table — Supabase style: 48px rows, sortable headers,
            hover actions on the right */}
        <div className="hidden lg:block rounded-xl border border-[var(--border)] bg-[var(--surface-1)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th
                  className="text-left px-5 h-10 text-xs font-medium text-[var(--muted)] cursor-pointer select-none hover:text-[var(--text)] transition-colors duration-150"
                  onClick={() => toggleSort("name")}
                >
                  Материал{sortArrow("name")}
                </th>
                <th
                  className="text-right px-4 h-10 text-xs font-medium text-[var(--muted)] cursor-pointer select-none hover:text-[var(--text)] transition-colors duration-150 w-40"
                  onClick={() => toggleSort("balance")}
                >
                  Остаток{sortArrow("balance")}
                </th>
                <th
                  className="text-left px-4 h-10 text-xs font-medium text-[var(--muted)] cursor-pointer select-none hover:text-[var(--text)] transition-colors duration-150 w-32"
                  onClick={() => toggleSort("status")}
                >
                  Статус{sortArrow("status")}
                </th>
                <th className="text-left px-4 h-10 text-xs font-medium text-[var(--muted)] w-32">
                  Неделя
                </th>
                <th className="w-56" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {tableSorted.map((m) => {
                const level = stockLevel(m);
                const s = TILE_STYLE[level];
                return (
                  <tr key={m.id} className="group h-12 hover:bg-[var(--surface-2)] transition-colors duration-150">
                    <td className="px-5 text-[var(--text)]">{m.name}</td>
                    <td className={`px-4 text-right num font-semibold ${level === "normal" ? "text-[var(--text)]" : s.num}`}>
                      {formatCompact(m.balance)}
                      <span className="text-xs font-normal text-[var(--muted)] ml-1.5">{m.unit}</span>
                    </td>
                    <td className="px-4">
                      <span className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            level === "critical" ? "bg-[var(--danger)]" : level === "low" ? "bg-[var(--warning)]" : "bg-[var(--success)]"
                          }`}
                        />
                        {level === "critical" ? "Критично" : level === "low" ? "Мало" : "Норма"}
                      </span>
                    </td>
                    <td className="px-4">
                      <WeekSparkline week={m.week} />
                    </td>
                    <td className="px-4 text-right">
                      <span className="inline-flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                        <Link
                          href={`/dashboard/transactions?material_id=${m.id}`}
                          className="px-2.5 h-7 inline-flex items-center rounded-md border border-[var(--border)] text-xs text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--border-strong)] transition-colors duration-150"
                        >
                          История
                        </Link>
                        <button
                          onClick={() => setSheetMaterial(m)}
                          className="px-2.5 h-7 inline-flex items-center rounded-md border border-[var(--border)] text-xs text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--border-strong)] transition-colors duration-150"
                        >
                          Корректировка
                        </button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}

      {/* Sheet + modal */}
      {sheetMaterial && (
        <MaterialSheet
          material={sheetMaterial}
          onClose={() => setSheetMaterial(null)}
          onEnterStock={() => {
            setStockMaterial(sheetMaterial);
            setSheetMaterial(null);
          }}
        />
      )}
      {stockMaterial && (
        <StockModal material={stockMaterial} onClose={() => setStockMaterial(null)} />
      )}
    </div>
  );
}
