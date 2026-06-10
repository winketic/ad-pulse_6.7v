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
        <h2 className="text-sm font-semibold text-[#888888] uppercase tracking-wide">
          Текущий остаток
        </h2>
        <span className="text-xs text-[#888888]">{balances.length} материалов</span>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 sm:mx-0 px-4 sm:px-0 snap-x">
        {balances.map((b) => {
          const isNegative = b.balance < 0;
          const isZero = b.balance === 0;

          return (
            <div
              key={b.material_id}
              className="bg-[#111111] rounded-xl border border-[#1f1f1f] p-4 min-w-[172px] max-w-[220px] flex-shrink-0 snap-start hover:shadow-sm transition-shadow"
            >
              {/* Name */}
              <p
                className="text-xs font-medium text-[#888888] uppercase tracking-wide truncate mb-2"
                title={b.name}
              >
                {b.name}
              </p>

              {/* Balance */}
              <p
                className={`text-2xl font-bold tabular-nums leading-none ${
                  isZero
                    ? "text-[#888888]"
                    : isNegative
                    ? "text-red-600"
                    : "text-[#00f5c4]"
                }`}
              >
                {isNegative ? "" : ""}
                {formatCompact(b.balance)}
              </p>
              <p className="text-xs text-[#888888] mt-0.5">{b.unit}</p>

              {/* Breakdown */}
              <div className="flex items-center gap-3 mt-3 pt-3 border-t border-[#1f1f1f]">
                <div className="flex items-center gap-1 text-xs">
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-green-100 text-green-600 font-bold text-[10px]">
                    ↑
                  </span>
                  <span className="tabular-nums text-[#888888] font-medium">
                    {formatCompact(b.totalIn)}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs">
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-100 text-red-500 font-bold text-[10px]">
                    ↓
                  </span>
                  <span className="tabular-nums text-[#888888] font-medium">
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
