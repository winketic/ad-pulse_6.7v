"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { formatCompact } from "@/lib/utils/format";

export type Material = { id: string; name: string; unit: string };
export type Balance = { income: number; expense: number; balance: number };

// Stock level classification against per-material thresholds:
// critical — at/below min threshold (or ≤0 with no threshold set)
// low      — within 2× of the threshold
// normal   — everything else
type StockLevel = "normal" | "low" | "critical";

function stockLevel(balance: number, threshold: number | undefined): StockLevel {
  if (threshold != null && threshold > 0) {
    if (balance <= threshold) return "critical";
    if (balance <= threshold * 2) return "low";
    return "normal";
  }
  if (balance <= 0) return "critical";
  return "normal";
}

const LEVEL_STYLE: Record<StockLevel, { dot: string; text: string; label: string }> = {
  normal:   { dot: "bg-[var(--success)]", text: "text-[var(--accent)]",  label: "норма" },
  low:      { dot: "bg-[var(--warning)]", text: "text-[var(--warning)]", label: "мало" },
  critical: { dot: "bg-[var(--danger)]",  text: "text-[var(--danger)]",  label: "критично" },
};

interface Props {
  materials: Material[];
  initialBalances: Record<string, Balance>;
  companyId: string;
  thresholds?: Record<string, number>;
}

export function BalanceTableRealtime({ materials, initialBalances, companyId, thresholds = {} }: Props) {
  const [balances, setBalances] = useState<Record<string, Balance>>(initialBalances);
  const supabase = createClient();

  useEffect(() => {
    const channel = supabase
      .channel(`balance-${companyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "material_transactions",
          filter: `company_id=eq.${companyId}`,
        },
        () => { void refetch(); }
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  async function refetch() {
    const { data } = await supabase
      .from("material_transactions")
      .select("material_id, type, quantity")
      .eq("company_id", companyId);

    if (!data) return;

    const next: Record<string, Balance> = {};
    for (const mat of materials) {
      next[mat.id] = { income: 0, expense: 0, balance: 0 };
    }
    for (const tx of data) {
      const b = next[tx.material_id];
      if (!b) continue;
      const qty = Number(tx.quantity);
      if (tx.type === "income" || tx.type === "return") {
        b.income += qty;
        b.balance += qty;
      } else {
        b.expense += qty;
        b.balance -= qty;
      }
    }
    setBalances(next);
  }

  if (materials.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-[var(--muted)]">Материалов нет</p>
        <Link href="/dashboard/materials" className="mt-2 inline-block text-sm text-[var(--accent)] hover:underline">
          Добавить материалы
        </Link>
      </div>
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="px-5 py-3 text-left text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Материал</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Приход</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Расход</th>
              <th className="px-5 py-3 text-right text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Остаток</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {materials.map((mat) => {
              const b = balances[mat.id] ?? { income: 0, expense: 0, balance: 0 };
              const level = stockLevel(b.balance, thresholds[mat.id]);
              const s = LEVEL_STYLE[level];
              return (
                <tr key={mat.id} className="hover:bg-[var(--bg3)] transition-colors">
                  <td className="px-5 py-3 font-medium text-[var(--text)] text-sm">
                    <span className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} title={s.label} />
                      <span className="break-words">{mat.name}</span>
                    </span>
                    <span className="text-xs text-[var(--muted)] pl-3.5">{mat.unit}</span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-sm text-[var(--success)] font-mono">{formatCompact(b.income)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-sm text-[var(--danger)] font-mono">{formatCompact(b.expense)}</td>
                  <td className="px-5 py-3 text-right">
                    <span className={`tabular-nums text-sm font-bold font-mono ${s.text}`}>
                      {formatCompact(b.balance)}
                    </span>
                    {level !== "normal" && (
                      <span className={`block text-[10px] font-semibold uppercase tracking-wide ${s.text}`}>
                        {s.label}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden divide-y divide-[var(--border)]">
        {materials.map((mat) => {
          const b = balances[mat.id] ?? { income: 0, expense: 0, balance: 0 };
          const level = stockLevel(b.balance, thresholds[mat.id]);
          const s = LEVEL_STYLE[level];
          return (
            <div key={mat.id} className="px-4 py-2.5 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[var(--text)] break-words flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} />
                  {mat.name}
                </p>
                <p className="text-xs text-[var(--muted)] pl-3">
                  {mat.unit}
                  {level !== "normal" && (
                    <span className={`ml-1.5 font-semibold uppercase text-[10px] tracking-wide ${s.text}`}>
                      {s.label}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0 text-xs tabular-nums font-mono">
                <span className="text-[var(--success)]">+{formatCompact(b.income)}</span>
                <span className="text-[var(--danger)]">−{formatCompact(b.expense)}</span>
                <span className={`font-bold text-sm ${s.text}`}>
                  {formatCompact(b.balance)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
