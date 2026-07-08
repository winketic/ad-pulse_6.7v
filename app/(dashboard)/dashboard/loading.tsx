function Shimmer({ className }: { className: string }) {
  return <div className={`rounded-lg bg-[var(--bg3)] ${className}`} />;
}

export default function DashboardLoading() {
  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto animate-pulse">
      {/* Header */}
      <div className="mb-6 space-y-2">
        <Shimmer className="h-7 w-56" />
        <Shimmer className="h-4 w-36" />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-5 space-y-2">
            <Shimmer className="h-3 w-20" />
            <Shimmer className="h-8 w-16" />
            <Shimmer className="h-3 w-12" />
          </div>
        ))}
      </div>

      {/* Balance + recent transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-4">
        <div className="lg:col-span-3 bg-[var(--card)] rounded-xl border border-[var(--border)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--border)]">
            <Shimmer className="h-4 w-36" />
          </div>
          <div className="divide-y divide-[var(--border)]">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="px-5 py-4 flex items-center gap-3">
                <Shimmer className="h-4 w-28" />
                <div className="flex-1" />
                <Shimmer className="h-5 w-16 rounded-full" />
              </div>
            ))}
          </div>
        </div>
        <div className="lg:col-span-2 bg-[var(--card)] rounded-xl border border-[var(--border)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--border)]">
            <Shimmer className="h-4 w-32" />
          </div>
          <div className="divide-y divide-[var(--border)]">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="px-5 py-3 flex items-center gap-3">
                <Shimmer className="h-5 w-14 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Shimmer className="h-3.5 w-24" />
                  <Shimmer className="h-3 w-16" />
                </div>
                <Shimmer className="h-4 w-12" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Plans */}
      <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border)]">
          <Shimmer className="h-4 w-48" />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="px-5 py-4 flex items-center gap-4 border-b border-[var(--border)] last:border-b-0">
            <div className="flex-1 space-y-1.5">
              <Shimmer className="h-4 w-40" />
              <Shimmer className="h-3 w-28" />
            </div>
            <Shimmer className="h-2 w-36 rounded-full hidden sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
