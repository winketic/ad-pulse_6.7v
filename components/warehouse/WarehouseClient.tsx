"use client";

import { useState, useTransition, useEffect } from "react";
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
              className="flex-1 min-h-[48px] px-4 rounded-xl bg-[#00f5c4] hover:bg-[#00ddb3] text-[#0a0a0a] text-sm font-semibold transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
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

function BalanceBadge({ balance, unit }: { balance: number; unit: string }) {
  const isLow = balance <= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-sm font-semibold tabular-nums font-mono ${
        isLow
          ? "bg-red-500/10 text-red-400"
          : "bg-[#00f5c4]/10 text-[#00f5c4]"
      }`}
    >
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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--text)]">Склад</h1>
        <p className="text-sm text-[var(--muted)] mt-0.5">
          {materials.length === 0
            ? "Нет материалов"
            : `${materials.length} позиц${materials.length === 1 ? "ия" : materials.length < 5 ? "ии" : "ий"} · остатки в реальном времени`}
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
                  <th className="px-5 py-3 text-right text-xs font-semibold text-[var(--muted)] uppercase tracking-wide w-44">
                    Действие
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {materials.map((m) => (
                  <tr key={m.id} className="hover:bg-[var(--bg3)] transition-colors">
                    <td className="px-5 py-3.5 font-medium text-[var(--text)]">
                      {m.name}
                    </td>
                    <td className="px-5 py-3.5 text-[var(--muted)]">{m.unit}</td>
                    <td className="px-5 py-3.5 text-right">
                      <BalanceBadge balance={m.balance} unit={m.unit} />
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => setModalMaterial(m)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs font-medium text-[var(--muted)] hover:bg-[var(--bg3)] hover:border-[#00f5c4] hover:text-[#00f5c4] transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                        Ввести остаток
                      </button>
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
                  <p className="font-medium text-[var(--text)] truncate">{m.name}</p>
                  <p className="text-xs text-[var(--muted)] mt-0.5">{m.unit}</p>
                </div>
                <BalanceBadge balance={m.balance} unit={m.unit} />
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
