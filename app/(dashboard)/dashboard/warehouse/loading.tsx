function Shimmer({ className }: { className: string }) {
  return <div className={`rounded-lg bg-[var(--bg3)] ${className}`} />;
}

export default function WarehouseLoading() {
  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto animate-pulse">
      <div className="mb-6 space-y-2">
        <Shimmer className="h-7 w-24" />
        <Shimmer className="h-4 w-44" />
      </div>
      <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] overflow-hidden hidden sm:block">
        <div className="bg-[var(--bg3)] px-5 py-3 border-b border-[var(--border)] flex gap-4">
          {["w-32", "w-16", "w-20 ml-auto"].map((w, i) => (
            <Shimmer key={i} className={`h-3 ${w}`} />
          ))}
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="px-5 py-4 flex items-center gap-4 border-b border-[var(--border)] last:border-b-0">
            <Shimmer className="h-4 w-40 flex-1" />
            <Shimmer className="h-4 w-12" />
            <Shimmer className="h-7 w-24 ml-auto rounded-lg" />
          </div>
        ))}
      </div>
      <div className="sm:hidden space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-[var(--card)] rounded-xl border border-[var(--border)] px-4 py-3.5 flex items-center gap-3">
            <div className="flex-1 space-y-1.5">
              <Shimmer className="h-4 w-32" />
              <Shimmer className="h-3 w-12" />
            </div>
            <Shimmer className="h-7 w-20 rounded-lg" />
            <Shimmer className="h-8 w-8 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
