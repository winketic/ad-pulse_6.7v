function Shimmer({ className }: { className: string }) {
  return <div className={`rounded-lg bg-[var(--bg3)] ${className}`} />;
}

export default function TransactionsLoading() {
  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto animate-pulse">
      <div className="flex items-center justify-between mb-6">
        <div className="space-y-2">
          <Shimmer className="h-7 w-48" />
          <Shimmer className="h-4 w-28" />
        </div>
        <Shimmer className="h-11 w-40 rounded-xl" />
      </div>
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <Shimmer key={i} className="h-10 w-28 rounded-xl shrink-0" />
        ))}
      </div>
      <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] overflow-hidden hidden sm:block">
        <div className="bg-[var(--bg3)] px-5 py-3.5 border-b border-[var(--border)] flex gap-4">
          {["w-20", "w-32", "w-20", "w-24 ml-auto", "w-28"].map((w, i) => (
            <Shimmer key={i} className={`h-3 ${w}`} />
          ))}
        </div>
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="px-5 py-3.5 flex items-center gap-4 border-b border-[var(--border)] last:border-b-0">
            <Shimmer className="h-3.5 w-20" />
            <Shimmer className="h-3.5 w-32" />
            <Shimmer className="h-5 w-16 rounded-full" />
            <div className="flex-1" />
            <Shimmer className="h-3.5 w-20" />
            <Shimmer className="h-3.5 w-24" />
          </div>
        ))}
      </div>
      <div className="sm:hidden space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <Shimmer className="h-5 w-16 rounded-full" />
              <Shimmer className="h-3.5 w-20" />
            </div>
            <Shimmer className="h-4 w-32" />
            <Shimmer className="h-6 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
