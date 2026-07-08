"use client";

import { formatCompact } from "@/lib/utils/format";

export type BalanceData = {
  material_id: string;
  name: string;
  unit: string;
  balance: number;
  totalIn: number;
  totalOut: number;
};


export default function BalanceCard({
  balances,
  showHeader = true,
}: {
  balances: BalanceData[];
  showHeader?: boolean;
}) {
  if (balances.length === 0) return null;

  return (
    <div className={showHeader ? "mb-6" : ""}>
      {showHeader && (
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wide">
          Текущий остаток
        </h2>
        <span className="text-xs text-[var(--muted)]">{balances.length} материалов</span>
      </div>
      )}

      <div className="flex gap-2.5 overflow-x-auto pb-2 -mx-4 sm:mx-0 px-4 sm:px-0 snap-x">
        {balances.map((b, i) => {
          const isNegative = b.balance < 0;
          const isZero = b.balance === 0;

          return (
            <div
              key={b.material_id}
              className="bg-[var(--surface-1)] rounded-xl border border-[var(--border)] p-4 min-w-[168px] max-w-[220px] flex-shrink-0 snap-start fade-in-up"
              style={{ animationDelay: `${Math.min(i * 40, 320)}ms` }}
            >
              {/* Name */}
              <p className="text-label truncate mb-2" title={b.name}>
                {b.name}
              </p>

              {/* Balance — ticker style */}
              <p
                className={`num-lg leading-none ${
                  isZero
                    ? "text-[var(--muted)]"
                    : isNegative
                    ? "text-[var(--danger)]"
                    : "text-[var(--accent)]"
                }`}
              >
                {formatCompact(b.balance)}
              </p>
              <p className="text-xs text-[var(--muted-2)] mt-1">{b.unit}</p>

              {/* Breakdown */}
              <div className="flex items-center gap-3 mt-3 pt-2.5 border-t border-[var(--border)]">
                <span className="num text-xs text-[var(--success)]">
                  ↑{formatCompact(b.totalIn)}
                </span>
                <span className="num text-xs text-[var(--danger)]">
                  ↓{formatCompact(b.totalOut)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
