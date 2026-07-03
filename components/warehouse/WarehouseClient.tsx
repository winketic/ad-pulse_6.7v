"use client";

import { useState, useTransition, useEffect } from "react";
import Link from "next/link";
import { setInitialStock } from "@/app/(dashboard)/dashboard/warehouse/actions";
import type { WarehouseMaterial } from "@/app/(dashboard)/dashboard/warehouse/page";

// ─── Fullscreen Modal ─────────────────────────────────────

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
    <div className="fixed inset-0 h-[100dvh] z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-[var(--card)] w-full h-full sm:h-auto sm:max-h-[94dvh] sm:max-w-sm sm:rounded-2xl shadow-2xl z-10 flex flex-col">
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 shrink-0 border-b border-[var(--border)]"
          style={{ minHeight: "56px", paddingTop: "env(safe-area-inset-top, 0px)" }}
        >
          <div className="min-w-0 flex-1 mr-3">
            <h2 className="text-base font-semibold text-[var(--text)] truncate">
              Ввести остаток
            </h2>
            <p className="text-xs text-[var(--muted)] truncate">{material.name}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--bg3)] text-[var(--muted)] transition-colors shrink-0"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="p-4 flex-1 space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--muted)] mb-1.5">
                Количество{" "}
                <span className="font-normal text-[var(--muted)]">({material.unit})</span>{" "}
                <span className="text-red-500">*</span>
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
                className="field-input"
              />
              <p className="mt-1.5 text-xs text-[var(--muted)]">
                Текущий остаток: {material.balance.toFixed(2)} {material.unit}
              </p>
            </div>

            <div className="p-3 rounded-lg bg-[var(--bg3)] border border-[var(--border)]">
              <p className="text-xs text-[var(--muted)]">
                Создаёт транзакцию <span className="font-medium text-[var(--text)]">«Приход»</span> с примечанием «Начальный остаток». Используется для фиксации реального текущего запаса на складе.
              </p>
            </div>

            {error && (
              <div className="px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                {error}
              </div>
            )}
          </div>

          {/* Fixed footer */}
          <div className="flex gap-3 px-4 border-t border-[var(--border)] bg-[var(--card)]"
            style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))", paddingTop: "0.75rem" }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="flex-1 min-h-[48px] px-4 rounded-xl border border-[var(--border)] text-sm font-medium text-[var(--muted)] hover:bg-[var(--bg3)] transition-colors disabled:opacity-50"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={isPending || !qty || Number(qty) <= 0}
              className="dp-btn-primary flex-1 rounded-xl"
            >
              {isPending && (
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {isPending ? "Сохранение..." : "Сохранить"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Balance badge ────────────────────────────────────────
// Stock level vs threshold: critical ≤ min, low ≤ 2×min, else normal.
// No threshold set → critical only at ≤0.
type StockLevel = "normal" | "low" | "critical";

function stockLevel(balance: number, threshold: number | null): StockLevel {
  if (threshold != null && threshold > 0) {
    if (balance <= threshold) return "critical";
    if (balance <= threshold * 2) return "low";
    return "normal";
  }
  return balance <= 0 ? "critical" : "normal";
}

const LEVEL_STYLE: Record<StockLevel, { badge: string; dot: string; label: string | null }> = {
  normal:   { badge: "bg-[var(--accent)]/10 text-[var(--accent)]",   dot: "bg-[var(--success)]", label: null },
  low:      { badge: "bg-[var(--warning-bg)] text-[var(--warning)]", dot: "bg-[var(--warning)]", label: "мало" },
  critical: { badge: "bg-[var(--danger-bg)] text-[var(--danger)]",   dot: "bg-[var(--danger)]",  label: "критично" },
};

function BalanceBadge({ balance, threshold, unit }: { balance: number; threshold: number | null; unit: string }) {
  const s = LEVEL_STYLE[stockLevel(balance, threshold)];
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-sm font-semibold num ${s.badge}`}>
      {balance.toFixed(2)}
      <span className="text-xs font-normal opacity-70">{unit}</span>
    </span>
  );
}

// ─── Main ─────────────────────────────────────────────────

export default function WarehouseClient({
  materials,
}: {
  materials: WarehouseMaterial[];
}) {
  const [modalMaterial, setModalMaterial] = useState<WarehouseMaterial | null>(null);

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-display text-[var(--text)]">Склад</h1>
        <p className="text-label mt-1.5">
          {materials.length === 0
            ? "Нет материалов"
            : `${materials.length} позиц${materials.length === 1 ? "ия" : materials.length < 5 ? "ии" : "ий"} · live`}
        </p>
      </div>

      {materials.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[var(--bg3)] flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-[var(--muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <p className="text-sm font-medium text-[var(--text)]">Справочник материалов пуст</p>
          <p className="text-xs text-[var(--muted)] mt-1">
            Добавьте материалы в{" "}
            <a href="/dashboard/materials" className="text-[#00f5c4] hover:underline">
              справочник
            </a>
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block bg-[var(--card)] rounded-xl border border-[var(--border)] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--bg3)] border-b border-[var(--border)]">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">
                    Материал
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-[var(--muted)] uppercase tracking-wide w-28">
                    Ед. изм.
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-[var(--muted)] uppercase tracking-wide w-40">
                    Остаток
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-[var(--muted)] uppercase tracking-wide w-60">
                    Действия
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {materials.map((m) => (
                  <tr key={m.id} className="hover:bg-[var(--bg3)] transition-colors">
                    <td className="px-5 py-3.5 font-medium text-[var(--text)]">
                      <span className="flex items-center gap-2">
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${LEVEL_STYLE[stockLevel(m.balance, m.threshold)].dot}`}
                        />
                        {m.name}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-[var(--muted)]">{m.unit}</td>
                    <td className="px-5 py-3.5 text-right">
                      <BalanceBadge balance={m.balance} threshold={m.threshold} unit={m.unit} />
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/dashboard/transactions?material_id=${m.id}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs font-medium text-[var(--muted)] hover:bg-[var(--bg3)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                          </svg>
                          История
                        </Link>
                        <button
                          onClick={() => setModalMaterial(m)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs font-medium text-[var(--muted)] hover:bg-[var(--bg3)] hover:border-[#00f5c4] hover:text-[#00f5c4] transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                          </svg>
                          Ввести остаток
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-2">
            {materials.map((m) => (
              <div
                key={m.id}
                className="bg-[var(--card)] rounded-xl border border-[var(--border)] px-4 py-3.5 flex items-center gap-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-[var(--text)] truncate flex items-center gap-1.5">
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${LEVEL_STYLE[stockLevel(m.balance, m.threshold)].dot}`}
                    />
                    {m.name}
                  </p>
                  <p className="text-xs text-[var(--muted)] mt-0.5 pl-3">
                    {m.unit}
                    {LEVEL_STYLE[stockLevel(m.balance, m.threshold)].label && (
                      <span className={`ml-1.5 text-[10px] font-semibold uppercase tracking-wide ${stockLevel(m.balance, m.threshold) === "critical" ? "text-[var(--danger)]" : "text-[var(--warning)]"}`}>
                        {LEVEL_STYLE[stockLevel(m.balance, m.threshold)].label}
                      </span>
                    )}
                  </p>
                </div>
                <BalanceBadge balance={m.balance} threshold={m.threshold} unit={m.unit} />
                <Link
                  href={`/dashboard/transactions?material_id=${m.id}`}
                  className="shrink-0 p-2 rounded-lg border border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                  title="История движения"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </Link>
                <button
                  onClick={() => setModalMaterial(m)}
                  className="shrink-0 p-2 rounded-lg border border-[var(--border)] text-[var(--muted)] hover:border-[#00f5c4] hover:text-[#00f5c4] transition-colors"
                  title="Ввести остаток"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Modal */}
      {modalMaterial && (
        <StockModal
          material={modalMaterial}
          onClose={() => setModalMaterial(null)}
        />
      )}
    </div>
  );
}
