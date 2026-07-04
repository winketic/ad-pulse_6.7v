"use client";

import { useState, useMemo, useRef, useTransition, useCallback } from "react";
import { createProductionTransaction } from "@/app/(dashboard)/dashboard/transactions/actions";
import { useToast } from "@/components/ui/Toast";
import { formatQuantity } from "@/lib/utils/format";
import { isNetworkError, savePending, clearPending } from "@/lib/hooks/useOfflineRetry";
import { OfflineRetryBanner } from "@/components/ui/OfflineRetryBanner";

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

type PendingProduction = { material_id: string; quantity: number; transaction_date: string; label: string };

const PENDING_KEY = "quick_produce";
const MAX_DIGITS = 6;

async function retryProduction(payload: PendingProduction) {
  await createProductionTransaction({
    material_id: payload.material_id,
    quantity: payload.quantity,
    transaction_date: payload.transaction_date,
  });
}

// Series prefix for anchor chips: "2ПБ-16-2п" → "2ПБ"
function seriesOf(name: string): string {
  const m = name.match(/^(\d+\s?ПБ)/i);
  return m ? m[1].replace(/\s/g, "").toUpperCase() : "ДР";
}

// ─── Numpad key ───────────────────────────────────────────

function Key({
  children,
  onPress,
  variant = "digit",
  disabled = false,
  ariaLabel,
}: {
  children: React.ReactNode;
  onPress: () => void;
  variant?: "digit" | "action" | "submit";
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`h-14 rounded-xl text-xl font-semibold select-none tap-scale transition-colors disabled:opacity-35 ${
        variant === "submit"
          ? "bg-[var(--accent)] text-[var(--accent-text)] shadow-[var(--glow-accent)]"
          : variant === "action"
          ? "bg-[var(--surface-2)] text-[var(--muted)] hover:bg-[var(--surface-3)]"
          : "num bg-[var(--surface-1)] border border-[var(--border)] text-[var(--text)] hover:bg-[var(--surface-2)]"
      }`}
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      {children}
    </button>
  );
}

// ─── Main ─────────────────────────────────────────────────

export default function ProduceClient({ materials }: { materials: ProduceMaterial[] }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(materials[0]?.id ?? null);
  const [qty, setQty] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  // Frequent (used in last 14d) on top, then everything alphabetically —
  // alphabetical order keeps series contiguous so anchors work.
  const { frequent, rest, seriesList } = useMemo(() => {
    const frequent = materials.filter((m) => m.freq14d > 0).slice(0, 5);
    const freqIds = new Set(frequent.map((m) => m.id));
    const rest = [...materials]
      .filter((m) => !freqIds.has(m.id))
      .sort((a, b) => a.name.localeCompare(b.name, "ru", { numeric: true }));
    const seriesList = Array.from(new Set(rest.map((m) => seriesOf(m.name))));
    return { frequent, rest, seriesList };
  }, [materials]);

  const selected = materials.find((m) => m.id === selectedId) ?? null;
  const qtyNum = parseInt(qty || "0", 10);

  const concreteAmount = selected && qtyNum > 0 ? qtyNum * selected.norm_concrete : null;
  const rebarAmount = selected && qtyNum > 0 ? qtyNum * selected.norm_rebar : null;

  const jumpToSeries = (s: string) => {
    listRef.current
      ?.querySelector(`[data-series="${s}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const pressDigit = (d: string) => {
    setQty((prev) => {
      if (prev.length >= MAX_DIGITS) return prev;
      if (prev === "" && d === "0") return prev; // no leading zeros
      return prev + d;
    });
  };
  const backspace = () => setQty((prev) => prev.slice(0, -1));

  const submit = useCallback(() => {
    if (!selected || qtyNum <= 0 || isPending) return;
    const mat = selected;
    const n = qtyNum;
    const today = new Date().toISOString().split("T")[0];
    const label = `${formatQuantity(n)} ${mat.unit} — ${mat.name}`;

    // Optimistic: clear input immediately, material stays for serial entry
    setQty("");
    toast(`✓ Записано: ${label}`, "success");

    startTransition(async () => {
      try {
        await createProductionTransaction({
          material_id: mat.id,
          quantity: n,
          transaction_date: today,
        });
        clearPending(PENDING_KEY);
      } catch (err) {
        if (isNetworkError(err)) {
          savePending<PendingProduction>(
            PENDING_KEY,
            { material_id: mat.id, quantity: n, transaction_date: today, label },
            label
          );
          toast("Нет связи — данные сохранены локально", "info");
        } else {
          toast(
            err instanceof Error ? `Не записано: ${err.message}` : "Ошибка записи",
            "error"
          );
        }
      }
    });
  }, [selected, qtyNum, isPending, toast]);

  const todayLabel = new Date().toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "numeric" });

  if (materials.length === 0) return null; // page handles the empty state

  const renderItem = (m: ProduceMaterial, opts?: { series?: boolean }) => {
    const active = m.id === selectedId;
    return (
      <button
        key={m.id}
        type="button"
        onClick={() => setSelectedId(m.id)}
        data-series={opts?.series ? seriesOf(m.name) : undefined}
        className={`w-full min-h-[48px] px-3 py-2.5 rounded-xl text-left snap-start transition-colors tap-scale ${
          active
            ? "bg-[var(--accent-15)] border border-[var(--accent)]/50"
            : "border border-transparent hover:bg-[var(--surface-2)]"
        }`}
        style={{ WebkitTapHighlightColor: "transparent" }}
      >
        <span className={`block text-sm font-bold leading-tight ${active ? "text-[var(--accent)]" : "text-[var(--text)]"}`}>
          {m.name}
        </span>
        {m.freq14d > 0 && (
          <span className="num text-[10px] text-[var(--muted)]">×{Math.round(m.freq14d)} за 14д</span>
        )}
      </button>
    );
  };

  return (
    <div className="max-w-lg mx-auto flex flex-col" style={{ height: "calc(100dvh - 56px - 72px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))" }}>
      <OfflineRetryBanner<PendingProduction> pendingKey={PENDING_KEY} onRetry={retryProduction} />

      {/* Compact header */}
      <div className="flex items-baseline justify-between px-4 pt-3 pb-2 shrink-0">
        <h1 className="text-label">Выпуск</h1>
        <span className="num text-[11px] text-[var(--muted-2)] capitalize">{todayLabel}</span>
      </div>

      {/* Series anchor chips */}
      {seriesList.length > 1 && (
        <div className="flex gap-1.5 px-4 pb-2 overflow-x-auto shrink-0">
          {seriesList.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => jumpToSeries(s)}
              className="num px-3 py-1.5 rounded-lg bg-[var(--surface-2)] text-xs font-bold text-[var(--muted)] hover:text-[var(--accent)] whitespace-nowrap tap-scale"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Main: list | numpad */}
      <div className="flex-1 min-h-0 grid grid-cols-[44%_1fr] gap-2 px-3">
        {/* Left: scrollable material list */}
        <div ref={listRef} className="overflow-y-auto snap-y pr-0.5 space-y-1 pb-2">
          {frequent.length > 0 && (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-2)] px-3 pt-1">Частые</p>
              {frequent.map((m) => renderItem(m))}
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-2)] px-3 pt-2">Все</p>
            </>
          )}
          {rest.map((m) => renderItem(m, { series: true }))}
        </div>

        {/* Right: entered qty + numpad */}
        <div className="flex flex-col min-h-0">
          <div className="flex items-baseline justify-center gap-1.5 py-2 shrink-0">
            <span className={`num text-5xl font-bold leading-none tracking-tighter ${qty ? "text-[var(--text)]" : "text-[var(--muted-2)]"}`}>
              {qty || "0"}
            </span>
            <span className="text-sm text-[var(--muted)]">{selected?.unit ?? "шт"}</span>
          </div>

          <div className="grid grid-cols-3 gap-1.5 content-start">
            {["7", "8", "9", "4", "5", "6", "1", "2", "3"].map((d) => (
              <Key key={d} onPress={() => pressDigit(d)}>{d}</Key>
            ))}
            <Key onPress={backspace} variant="action" ariaLabel="Стереть">
              <svg className="w-5 h-5 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 001.414.586H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z" />
              </svg>
            </Key>
            <Key onPress={() => pressDigit("0")}>0</Key>
            <Key onPress={submit} variant="submit" disabled={!selected || qtyNum <= 0} ariaLabel="Записать">
              <svg className="w-6 h-6 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.6}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </Key>
          </div>
        </div>
      </div>

      {/* Live result strip */}
      <div className="shrink-0 border-t border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
        {selected && qtyNum > 0 && concreteAmount != null && rebarAmount != null ? (
          <p className="text-sm text-[var(--text)] leading-snug">
            <span className="num font-bold text-[var(--accent)]">{qtyNum} {selected.unit}</span>{" "}
            {selected.name} →{" "}
            <span className="num">бетон {concreteAmount.toFixed(2)} {selected.concrete_unit}</span>
            {" · "}
            <span className="num">{selected.rebar_material_name.toLowerCase()} {rebarAmount.toFixed(2)} {selected.rebar_unit}</span>
          </p>
        ) : (
          <p className="text-xs text-[var(--muted-2)]">
            {selected ? `${selected.name} — наберите количество` : "Выберите перемычку"}
          </p>
        )}
      </div>
    </div>
  );
}
