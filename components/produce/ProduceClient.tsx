"use client";

import { useState, useMemo, useRef, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  createProductionTransaction,
  createTransaction,
} from "@/app/(dashboard)/dashboard/transactions/actions";
import { useToast } from "@/components/ui/Toast";

export type ProduceMaterial = {
  id: string;
  name: string;
  unit: string;
  // Category-Б перемычки have no norms yet → null. Produced штука only, no deduction.
  norm_concrete: number | null;
  norm_rebar: number | null;
  rebar_material_name: string; // 'Арматура' | 'Проволока'
  concrete_unit: string;
  rebar_unit: string;
  freq14d: number;
};

export type RawStock = { name: string; unit: string; balance: number };

type CartItem = { material_id: string; qty: number };

const MAX_DIGITS = 6;

// Series prefix for anchor chips: "2ПБ16-2" → "2ПБ"
function seriesOf(name: string): string {
  const m = name.match(/^(\d+\s?ПБ)/i);
  return m ? m[1].replace(/\s/g, "").toUpperCase() : "ДР";
}

const fmt = (n: number) => Number(n.toFixed(2)).toLocaleString("ru-RU");

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
      className={`h-12 rounded-xl text-xl font-semibold select-none tap-scale transition-colors disabled:opacity-35 ${
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
export default function ProduceClient({
  materials,
  rawStock,
}: {
  materials: ProduceMaterial[];
  rawStock: RawStock[];
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(materials[0]?.id ?? null);
  const [qty, setQty] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  // Positions the last "Записать всё" could not record (raw depleted / error) —
  // kept in the cart and highlighted.
  const [heldIds, setHeldIds] = useState<Set<string>>(new Set());
  const listRef = useRef<HTMLDivElement>(null);

  const byId = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials]);
  const concreteStock = rawStock.find((r) => r.name === "Бетон");
  const rebarStock = useMemo(
    () => new Map(rawStock.filter((r) => r.name !== "Бетон").map((r) => [r.name, r])),
    [rawStock],
  );

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
  const isNormed = (m: ProduceMaterial) => m.norm_concrete != null && m.norm_rebar != null;

  // ── Live cart aggregate + per-item soft flags (running balances) ──────────
  const analysis = useMemo(() => {
    let runConc = concreteStock?.balance ?? 0;
    const runReb = new Map<string, number>(
      Array.from(rebarStock.entries()).map(([n, r]) => [n, r.balance]),
    );
    let concreteTotal = 0;
    const rebarTotals = new Map<string, number>();
    let bCount = 0;
    const flags = new Map<string, "ok" | "warn" | "critical" | "b">();

    for (const item of cart) {
      const mat = byId.get(item.material_id);
      if (!mat) continue;
      if (!isNormed(mat)) {
        bCount++;
        flags.set(mat.id, "b");
        continue;
      }
      const cNeed = item.qty * (mat.norm_concrete as number);
      const rNeed = item.qty * (mat.norm_rebar as number);
      const rn = mat.rebar_material_name;
      concreteTotal += cNeed;
      rebarTotals.set(rn, (rebarTotals.get(rn) ?? 0) + rNeed);

      const rebarHave = runReb.get(rn) ?? 0;
      if (runConc <= 0 || rebarHave <= 0) flags.set(mat.id, "critical");
      else if (runConc - cNeed < 0 || rebarHave - rNeed < 0) flags.set(mat.id, "warn");
      else flags.set(mat.id, "ok");

      runConc -= cNeed;
      runReb.set(rn, rebarHave - rNeed);
    }
    return { concreteTotal, rebarTotals, bCount, flags };
  }, [cart, byId, concreteStock, rebarStock]);

  const jumpToSeries = (s: string) =>
    listRef.current
      ?.querySelector(`[data-series="${s}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });

  const pressDigit = (d: string) =>
    setQty((p) => (p.length >= MAX_DIGITS ? p : p === "" && d === "0" ? p : p + d));
  const backspace = () => setQty((p) => p.slice(0, -1));

  // Add current selection+qty to the cart (merge same material), keep selection.
  const addToCart = useCallback(() => {
    if (!selected || qtyNum <= 0) return;
    const id = selected.id;
    setCart((prev) => {
      const existing = prev.find((c) => c.material_id === id);
      if (existing)
        return prev.map((c) => (c.material_id === id ? { ...c, qty: c.qty + qtyNum } : c));
      return [...prev, { material_id: id, qty: qtyNum }];
    });
    setHeldIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setQty("");
  }, [selected, qtyNum]);

  const bumpQty = (id: string, delta: number) =>
    setCart((prev) =>
      prev.flatMap((c) => {
        if (c.material_id !== id) return [c];
        const q = c.qty + delta;
        return q <= 0 ? [] : [{ ...c, qty: q }];
      }),
    );
  const removeItem = (id: string) => setCart((prev) => prev.filter((c) => c.material_id !== id));

  // ── Record the whole cart. Soft mode: items that would go negative still
  // record (with a warning); an item whose required raw is already ≤0 is held
  // back (highlighted), the rest go through. Partial success is expected. ──
  const submitAll = useCallback(() => {
    if (cart.length === 0 || isPending) return;
    const items = [...cart];
    const today = new Date().toISOString().split("T")[0];

    startTransition(async () => {
      let runConc = concreteStock?.balance ?? 0;
      const runReb = new Map<string, number>(
        Array.from(rebarStock.entries()).map(([n, r]) => [n, r.balance]),
      );
      const recorded: string[] = [];
      const held: string[] = [];
      const failed: string[] = [];

      for (const item of items) {
        const mat = byId.get(item.material_id);
        if (!mat) continue;
        try {
          if (isNormed(mat)) {
            const rn = mat.rebar_material_name;
            const rebarHave = runReb.get(rn) ?? 0;
            // Hard floor: nothing to consume → hold this position, keep others.
            if (runConc <= 0 || rebarHave <= 0) {
              held.push(item.material_id);
              continue;
            }
            await createProductionTransaction({
              material_id: mat.id,
              quantity: item.qty,
              transaction_date: today,
            });
            runConc -= item.qty * (mat.norm_concrete as number);
            runReb.set(rn, rebarHave - item.qty * (mat.norm_rebar as number));
          } else {
            // Category Б — record выпуск only, no raw deduction.
            await createTransaction({
              type: "income",
              material_id: mat.id,
              quantity: item.qty,
              note: `Производство: ${mat.name} ${item.qty} шт (без списания — нормы не заданы)`,
              counterparty: null,
              transaction_date: today,
              unit_price: null,
            });
          }
          recorded.push(item.material_id);
        } catch (e) {
          failed.push(item.material_id);
          // eslint-disable-next-line no-console
          console.error("[produce] record failed", mat.name, e);
        }
      }

      const keep = new Set([...held, ...failed]);
      setCart((prev) => prev.filter((c) => keep.has(c.material_id)));
      setHeldIds(keep);

      if (recorded.length) toast(`✓ Записано ${recorded.length} ${plural(recorded.length)}`, "success");
      if (held.length) toast(`${held.length} отложено — нет остатка сырья`, "info");
      if (failed.length) toast(`${failed.length} не записано — ошибка`, "error");
      router.refresh();
    });
  }, [cart, isPending, byId, concreteStock, rebarStock, toast, router]);

  if (materials.length === 0) return null;

  const renderItem = (m: ProduceMaterial, opts?: { series?: boolean }) => {
    const active = m.id === selectedId;
    return (
      <button
        key={m.id}
        type="button"
        onClick={() => setSelectedId(m.id)}
        data-series={opts?.series ? seriesOf(m.name) : undefined}
        className={`w-full min-h-[44px] px-3 py-2 rounded-xl text-left snap-start transition-colors tap-scale ${
          active
            ? "bg-[var(--accent-15)] border border-[var(--accent)]/50"
            : "border border-transparent hover:bg-[var(--surface-2)]"
        }`}
        style={{ WebkitTapHighlightColor: "transparent" }}
      >
        <span
          className={`block text-sm font-bold leading-tight ${active ? "text-[var(--accent)]" : "text-[var(--text)]"}`}
        >
          {m.name}
        </span>
        <span className="num text-[10px] text-[var(--muted)]">
          {isNormed(m) ? (m.freq14d > 0 ? `×${Math.round(m.freq14d)} за 14д` : "") : "без норм · штука"}
        </span>
      </button>
    );
  };

  const cartCount = cart.length;

  return (
    <div
      className="max-w-lg mx-auto flex flex-col"
      style={{
        height:
          "calc(100dvh - 56px - 72px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))",
      }}
    >
      {/* Header */}
      <div className="flex items-baseline justify-between px-4 pt-2.5 pb-1.5 shrink-0">
        <h1 className="text-label">Выпуск</h1>
        <span className="num text-[11px] text-[var(--muted-2)]">
          {new Date().toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "numeric" })}
        </span>
      </div>

      {/* Series anchors */}
      {seriesList.length > 1 && (
        <div className="flex gap-1.5 px-4 pb-1.5 overflow-x-auto shrink-0">
          {seriesList.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => jumpToSeries(s)}
              className="num px-3 py-1 rounded-lg bg-[var(--surface-2)] text-xs font-bold text-[var(--muted)] hover:text-[var(--accent)] whitespace-nowrap tap-scale"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Entry: list | numpad — fixed height, cart takes the rest */}
      <div className="grid grid-cols-[42%_1fr] gap-2 px-3 shrink-0" style={{ height: 274 }}>
        <div ref={listRef} className="overflow-y-auto snap-y pr-0.5 space-y-0.5 pb-1">
          {frequent.length > 0 && (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-2)] px-3 pt-0.5">
                Частые
              </p>
              {frequent.map((m) => renderItem(m))}
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-2)] px-3 pt-1.5">
                Все
              </p>
            </>
          )}
          {rest.map((m) => renderItem(m, { series: true }))}
        </div>

        <div className="flex flex-col min-h-0">
          <div className="flex items-baseline justify-center gap-1.5 pb-1.5 shrink-0">
            <span
              className={`num text-4xl font-bold leading-none tracking-tighter ${qty ? "text-[var(--text)]" : "text-[var(--muted-2)]"}`}
            >
              {qty || "0"}
            </span>
            <span className="text-sm text-[var(--muted)]">{selected?.unit ?? "шт"}</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5 content-start">
            {["7", "8", "9", "4", "5", "6", "1", "2", "3"].map((d) => (
              <Key key={d} onPress={() => pressDigit(d)}>
                {d}
              </Key>
            ))}
            <Key onPress={backspace} variant="action" ariaLabel="Стереть">
              <svg className="w-5 h-5 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 001.414.586H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z" />
              </svg>
            </Key>
            <Key onPress={() => pressDigit("0")}>0</Key>
            <Key onPress={addToCart} variant="submit" disabled={!selected || qtyNum <= 0} ariaLabel="Добавить в список">
              <svg className="w-6 h-6 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.6}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </Key>
          </div>
        </div>
      </div>

      {/* Add hint */}
      <p className="px-4 pt-1.5 pb-1 text-[11px] text-[var(--muted-2)] shrink-0">
        {selected
          ? `Выбрано: ${selected.name}${qtyNum > 0 ? ` — ${qtyNum} шт. Нажмите + чтобы добавить в список.` : " — наберите количество"}`
          : "Выберите перемычку"}
      </p>

      {/* Cart (scrolls) */}
      <div className="flex-1 min-h-0 overflow-y-auto border-t border-[var(--border)] bg-[var(--surface-1)]/40">
        {cartCount === 0 ? (
          <div className="h-full flex items-center justify-center px-4">
            <p className="text-xs text-[var(--muted-2)] text-center">
              Список пуст. Выберите перемычку, наберите количество и нажмите +.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {cart.map((item) => {
              const mat = byId.get(item.material_id);
              if (!mat) return null;
              const flag = analysis.flags.get(mat.id);
              const held = heldIds.has(mat.id);
              return (
                <div
                  key={item.material_id}
                  className={`flex items-center gap-2 px-3 py-2 ${held ? "bg-[var(--danger-bg)]" : ""}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--text)] leading-tight truncate">
                      {mat.name}
                      <span className="text-[var(--muted)] font-normal"> — {item.qty} шт</span>
                    </p>
                    {flag === "b" && (
                      <p className="text-[10px] text-[var(--muted-2)]">без списания сырья</p>
                    )}
                    {flag === "warn" && (
                      <p className="text-[10px] text-[var(--warning)]">спишет сырьё в минус</p>
                    )}
                    {(flag === "critical" || held) && (
                      <p className="text-[10px] text-[var(--danger)]">нет остатка сырья — не запишется</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => bumpQty(item.material_id, -1)}
                      aria-label="Меньше"
                      className="w-8 h-8 rounded-lg bg-[var(--surface-2)] text-[var(--text)] text-lg font-bold tap-scale"
                    >
                      −
                    </button>
                    <span className="num min-w-[32px] px-1 text-center text-sm font-bold text-[var(--text)] tabular-nums">
                      {item.qty}
                    </span>
                    <button
                      type="button"
                      onClick={() => bumpQty(item.material_id, 1)}
                      aria-label="Больше"
                      className="w-8 h-8 rounded-lg bg-[var(--surface-2)] text-[var(--text)] text-lg font-bold tap-scale"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      onClick={() => removeItem(item.material_id)}
                      aria-label="Удалить из списка"
                      className="w-8 h-8 rounded-lg text-[var(--muted)] hover:text-[var(--danger)] tap-scale flex items-center justify-center"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Aggregate + record — sticky bottom of the (nav-clearing) container */}
      <div className="shrink-0 border-t border-[var(--border)] bg-[var(--surface-1)] px-4 py-2.5">
        {cartCount > 0 && (
          <p className="text-xs text-[var(--text)] leading-snug mb-2">
            <span className="text-[var(--muted)]">Итого спишется: </span>
            <span className="num font-semibold">
              бетон {fmt(analysis.concreteTotal)} {concreteStock?.unit ?? "м³"}
            </span>
            {Array.from(analysis.rebarTotals.entries()).map(([name, val]) => (
              <span key={name} className="num font-semibold">
                {" · "}
                {name.toLowerCase()} {fmt(val)} {rebarStock.get(name)?.unit ?? "кг"}
              </span>
            ))}
            {analysis.bCount > 0 && (
              <span className="text-[var(--muted-2)]"> · +{analysis.bCount} без списания</span>
            )}
          </p>
        )}
        <button
          type="button"
          onClick={submitAll}
          disabled={cartCount === 0 || isPending}
          className="dp-btn-primary w-full min-h-[52px] rounded-xl text-base disabled:opacity-40"
        >
          {isPending ? "Запись…" : `Записать всё${cartCount > 0 ? ` (${cartCount})` : ""}`}
        </button>
      </div>
    </div>
  );
}

function plural(n: number) {
  if (n % 10 === 1 && n % 100 !== 11) return "позиция";
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return "позиции";
  return "позиций";
}
