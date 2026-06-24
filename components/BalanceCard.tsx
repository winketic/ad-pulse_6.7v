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


export default function BalanceCard({ balances }: { balances: BalanceData[] }) {
  if (balances.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wide">
          Текущий остаток
        </h2>
        <span className="text-xs text-[var(--muted)]">{balances.length} материалов</span>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 sm:mx-0 px-4 sm:px-0 snap-x">
        {balances.map((b) => {
          const isNegative = b.balance < 0;
          const isZero = b.balance === 0;

          return (
            <div
              key={b.material_id}
              className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-5 min-w-[180px] max-w-[230px] flex-shrink-0 snap-start hover:shadow-sm transition-shadow"
            >
              {/* Name */}
              <p
                className="text-xs font-medium text-[var(--muted)] uppercase tracking-wide truncate mb-2.5"
                title={b.name}
              >
                {b.name}
              </p>

              {/* Balance */}
              <p
                className={`text-3xl font-bold tabular-nums leading-none tracking-tight ${
                  isZero
                    ? "text-[var(--muted)]"
                    : isNegative
                    ? "text-red-600"
                    : "text-[#00f5c4]"
                }`}
              >
                {isNegative ? "" : ""}
                {formatCompact(b.balance)}
              </p>
              <p className="text-xs text-[var(--muted)] mt-0.5">{b.unit}</p>

              {/* Breakdown */}
              <div className="flex items-center gap-3 mt-3 pt-3 border-t border-[var(--border)]">
                <div className="flex items-center gap-1 text-xs">
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-green-100 text-green-600 font-bold text-[10px]">
                    ↑
                  </span>
                  <span className="tabular-nums text-[var(--muted)] font-medium">
                    {formatCompact(b.totalIn)}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs">
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-100 text-red-500 font-bold text-[10px]">
                    ↓
                  </span>
                  <span className="tabular-nums text-[var(--muted)] font-medium">
                    {formatCompact(b.totalOut)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
