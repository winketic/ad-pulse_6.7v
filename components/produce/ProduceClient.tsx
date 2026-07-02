"use client";

import { useState, useTransition, useEffect, useRef, useCallback } from "react";
import { createProductionTransaction } from "@/app/(dashboard)/dashboard/transactions/actions";
import { useToast } from "@/components/ui/Toast";
import { formatQuantity } from "@/lib/utils/format";

export type ProduceMaterial = {
  id: string;
  name: string;
  unit: string;
  norm_concrete: number;
  norm_rebar: number;
  rebar_material_name: string;
  concrete_unit: string;
  rebar_unit: string;
  freq14d: number;
};

// ─── Quick Quantity Modal ─────────────────────────────────

function QuickQuantityModal({
  material,
  onClose,
}: {
  material: ProduceMaterial;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [qty, setQty] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input + lock scroll on open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Small delay so keyboard doesn't fight the mount animation
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => {
      clearTimeout(t);
      document.body.style.overflow = prev;
    };
  }, []);

  // Escape closes
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  const qtyNum = Number(qty) || 0;
  const concreteAmount = qtyNum > 0 ? qtyNum * material.norm_concrete : null;
  const rebarAmount = qtyNum > 0 ? qtyNum * material.norm_rebar : null;

  const adjust = useCallback((delta: number) => {
    setQty((prev) => {
      const n = Math.max(0, (Number(prev) || 0) + delta);
      return n === 0 ? "" : String(n);
    });
    setError("");
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(qty);
    if (!qty || isNaN(n) || n <= 0) {
      setError("Введите количество");
      inputRef.current?.focus();
      return;
    }
    setError("");
    startTransition(async () => {
      try {
        const today = new Date().toISOString().split("T")[0];
        await createProductionTransaction({
          material_id: material.id,
          quantity: n,
          transaction_date: today,
        });
        toast(`✓ Записано: ${formatQuantity(n)} ${material.unit} — ${material.name}`, "success");
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка сохранения");
      }
    });
  };

  const canSubmit = qtyNum > 0 && qtyNum <= 999999;

  return (
    <div className="fixed inset-0 h-[100dvh] z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        onTouchMove={(e) => e.preventDefault()}
      />
      <div className="relative bg-[var(--card)] w-full sm:max-w-sm sm:rounded-2xl shadow-2xl z-10 flex flex-col"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 shrink-0 border-b border-[var(--border)]"
          style={{ minHeight: "56px", paddingTop: "env(safe-area-inset-top, 0px)" }}
        >
          <div className="min-w-0 flex-1 mr-3">
            <h2 className="text-base font-semibold text-[var(--text)] truncate">{material.name}</h2>
            <p className="text-xs text-[var(--muted)]">{material.unit}</p>
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

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Quantity input */}
          <div>
            <label className="block text-sm font-medium text-[var(--muted)] mb-1.5">
              Количество <span className="font-normal">({material.unit})</span> <span className="text-red-500">*</span>
            </label>
            <input
              ref={inputRef}
              type="number"
              value={qty}
              onChange={(e) => { setQty(e.target.value); setError(""); }}
              placeholder="0"
              min="1"
              max="999999"
              step="1"
              inputMode="numeric"
              className="field-input text-2xl font-bold text-center tabular-nums"
            />
          </div>

          {/* Quick-adjust buttons */}
          <div className="grid grid-cols-5 gap-2">
            {([-1, 1, 5, 10, 50] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => adjust(d)}
                disabled={isPending}
                className="py-3 rounded-xl border border-[var(--border)] text-sm font-semibold text-[var(--text)] hover:bg-[var(--bg3)] hover:border-[#00f5c4] transition-colors disabled:opacity-40 min-h-[48px]"
              >
                {d > 0 ? `+${d}` : d}
              </button>
            ))}
          </div>

          {/* Preview */}
          {concreteAmount != null && rebarAmount != null && (
            <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg bg-[#00f5c4]/8 border border-[#00f5c4]/20">
              <svg className="w-4 h-4 text-[#00a884] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-[var(--text)]">
                Спишется: бетон {concreteAmount.toFixed(2)} {material.concrete_unit},{" "}
                {material.rebar_material_name.toLowerCase()} {rebarAmount.toFixed(2)} {material.rebar_unit}
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="flex-1 min-h-[52px] px-4 rounded-xl border border-[var(--border)] text-sm font-medium text-[var(--muted)] hover:bg-[var(--bg3)] transition-colors disabled:opacity-50"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={isPending || !canSubmit}
              className="flex-1 min-h-[52px] px-4 rounded-xl bg-[#00f5c4] hover:bg-[#00ddb3] text-[#0a0a0a] text-sm font-semibold transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {isPending ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Записываем...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Записать
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Material Card ────────────────────────────────────────

function MaterialCard({
  material,
  onTap,
}: {
  material: ProduceMaterial;
  onTap: () => void;
}) {
  return (
    <button
      onClick={onTap}
      className="group relative flex flex-col justify-between p-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] hover:border-[#00f5c4] hover:bg-[#00f5c4]/5 active:scale-[0.97] transition-all text-left min-h-[100px]"
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      {/* Usage badge */}
      {material.freq14d > 0 && (
        <span className="absolute top-3 right-3 text-[10px] font-semibold text-[var(--muted)] bg-[var(--bg3)] px-1.5 py-0.5 rounded-md tabular-nums">
          ×{Math.round(material.freq14d)}
        </span>
      )}

      {/* Material name */}
      <p className="text-sm font-bold text-[var(--text)] leading-snug pr-8 group-hover:text-[#00f5c4] transition-colors">
        {material.name}
      </p>

      {/* Bottom row: unit + tap hint */}
      <div className="flex items-end justify-between mt-2">
        <p className="text-xs text-[var(--muted)]">{material.unit}</p>
        <div className="w-7 h-7 rounded-lg bg-[#00f5c4]/10 flex items-center justify-center group-hover:bg-[#00f5c4]/20 transition-colors shrink-0">
          <svg className="w-4 h-4 text-[#00f5c4]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </div>
      </div>
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────

export default function ProduceClient({ materials }: { materials: ProduceMaterial[] }) {
  const [active, setActive] = useState<ProduceMaterial | null>(null);

  const todayLabel = new Date().toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--text)]">Быстрый выпуск</h1>
        <p className="text-sm text-[var(--muted)] mt-0.5 capitalize">{todayLabel}</p>
      </div>

      {/* Hint */}
      <p className="text-xs text-[var(--muted)] mb-4">
        Нажмите на перемычку → введите количество → готово.{" "}
        {materials.some((m) => m.freq14d > 0) && "×N — выпуск за 14 дней."}
      </p>

      {/* Material grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {materials.map((m) => (
          <MaterialCard
            key={m.id}
            material={m}
            onTap={() => setActive(m)}
          />
        ))}
      </div>

      {/* Modal */}
      {active && (
        <QuickQuantityModal
          material={active}
          onClose={() => setActive(null)}
        />
      )}
    </div>
  );
}
