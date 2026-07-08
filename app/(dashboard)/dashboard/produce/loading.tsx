function Shimmer({ className }: { className: string }) {
  return <div className={`rounded-lg bg-[var(--bg3)] ${className}`} />;
}

export default function ProduceLoading() {
  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto animate-pulse">
      <div className="mb-6 space-y-2">
        <Shimmer className="h-7 w-40" />
        <Shimmer className="h-4 w-32" />
      </div>
      <Shimmer className="h-4 w-64 mb-4" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-[var(--card)] rounded-2xl border border-[var(--border)] p-4 min-h-[100px] flex flex-col justify-between">
            <Shimmer className="h-4 w-24" />
            <div className="flex items-end justify-between mt-2">
              <Shimmer className="h-3 w-10" />
              <Shimmer className="h-7 w-7 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
