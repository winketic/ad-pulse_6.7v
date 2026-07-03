function Shimmer({ className }: { className: string }) {
  return <div className={`rounded-lg bg-[var(--surface-2)] ${className}`} />;
}

export default function ReportsLoading() {
  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto animate-pulse">
      <div className="flex items-start justify-between mb-6">
        <div className="space-y-2">
          <Shimmer className="h-8 w-36" />
          <Shimmer className="h-3 w-40" />
        </div>
        <Shimmer className="h-11 w-36 rounded-xl" />
      </div>
      {/* Period picker */}
      <div className="flex gap-3 mb-5">
        <Shimmer className="h-[52px] flex-1 rounded-xl" />
        <Shimmer className="h-[52px] flex-1 rounded-xl" />
        <Shimmer className="h-[52px] w-28 rounded-xl" />
      </div>
      {/* Summary table: name + 4 number columns + balance */}
      <div className="bg-[var(--surface-1)] rounded-xl border border-[var(--border)] overflow-hidden mb-4">
        <div className="h-11 bg-[var(--surface-2)] border-b border-[var(--border)]" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-12 border-b border-[var(--border)] last:border-b-0 px-4 flex items-center gap-4">
            <Shimmer className="h-4 w-36" />
            <div className="flex-1" />
            <Shimmer className="h-4 w-14" />
            <Shimmer className="h-4 w-14" />
            <Shimmer className="h-4 w-14" />
            <Shimmer className="h-4 w-16" />
          </div>
        ))}
      </div>
      {/* Defects card */}
      <div className="bg-[var(--surface-1)] rounded-xl border border-[var(--border)] p-5">
        <div className="flex items-start justify-between">
          <Shimmer className="h-4 w-32" />
          <Shimmer className="h-8 w-12" />
        </div>
      </div>
    </div>
  );
}
