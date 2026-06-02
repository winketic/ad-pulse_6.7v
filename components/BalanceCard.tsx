"use client";

export type BalanceData = {
  material_id: string;
  name: string;
  unit: string;
  balance: number;
  totalIn: number;
  totalOut: number;
};

function BalanceChip({
  balance,
  unit,
}: {
  balance: number;
  unit: string;
}) {
  const isPositive = balance > 0;
  const isZero = balance === 0;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
        isZero
          ? "bg-gray-100 text-gray-500"
          : isPositive
          ? "bg-green-100 text-green-700"
          : "bg-red-100 text-red-700"
      }`}
    >
      {isPositive ? "↑" : isZero ? "—" : "↓"}
      {Math.abs(balance).toFixed(2)} {unit}
    </span>
  );
}

export default function BalanceCard({ balances }: { balances: BalanceData[] }) {
  if (balances.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          Текущий остаток
        </h2>
        <span className="text-xs text-gray-400">{balances.length} материалов</span>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 sm:mx-0 px-4 sm:px-0 snap-x">
        {balances.map((b) => {
          const isNegative = b.balance < 0;
          const isZero = b.balance === 0;

          return (
            <div
              key={b.material_id}
              className="bg-white rounded-xl border border-gray-200 p-4 min-w-[172px] max-w-[220px] flex-shrink-0 snap-start hover:shadow-sm transition-shadow"
            >
              {/* Name */}
              <p
                className="text-xs font-medium text-gray-500 uppercase tracking-wide truncate mb-2"
                title={b.name}
              >
                {b.name}
              </p>

              {/* Balance */}
              <p
                className={`text-2xl font-bold tabular-nums leading-none ${
                  isZero
                    ? "text-gray-400"
                    : isNegative
                    ? "text-red-600"
                    : "text-[#1a472a]"
                }`}
              >
                {isNegative ? "" : ""}
                {b.balance.toFixed(2)}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">{b.unit}</p>

              {/* Breakdown */}
              <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100">
                <div className="flex items-center gap-1 text-xs">
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-green-100 text-green-600 font-bold text-[10px]">
                    ↑
                  </span>
                  <span className="tabular-nums text-gray-600 font-medium">
                    {b.totalIn.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs">
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-100 text-red-500 font-bold text-[10px]">
                    ↓
                  </span>
                  <span className="tabular-nums text-gray-600 font-medium">
                    {b.totalOut.toFixed(2)}
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
