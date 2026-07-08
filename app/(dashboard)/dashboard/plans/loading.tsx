function Shimmer({ className }: { className: string }) {
  return <div className={`rounded-lg bg-[var(--surface-2)] ${className}`} />;
}

export default function PlansLoading() {
  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto animate-pulse">
      <div className="mb-6 space-y-2">
        <Shimmer className="h-8 w-64" />
        <Shimmer className="h-3 w-20" />
      </div>
      {/* Status tabs */}
      <Shimmer className="h-10 w-72 rounded-xl mb-6" />
      {/* Plan cards: badge row + name + big % + progress bar */}
      <div className="space-y-2.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-[var(--surface-1)] rounded-xl border border-[var(--border)] p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 space-y-2">
                <div className="flex gap-2">
                  <Shimmer className="h-5 w-16 rounded-full" />
                  <Shimmer className="h-5 w-28" />
                </div>
                <Shimmer className="h-5 w-48" />
              </div>
              <Shimmer className="h-8 w-16" />
            </div>
            <Shimmer className="h-2 w-full rounded-full mt-4" />
            <Shimmer className="h-3 w-24 mt-2" />
          </div>
        ))}
      </div>
    </div>
  );
}
