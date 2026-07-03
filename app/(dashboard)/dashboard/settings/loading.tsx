function Shimmer({ className }: { className: string }) {
  return <div className={`rounded-lg bg-[var(--surface-2)] ${className}`} />;
}

export default function SettingsLoading() {
  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto animate-pulse">
      <Shimmer className="h-8 w-40 mb-5" />
      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <Shimmer key={i} className="h-10 w-24 rounded-xl" />
        ))}
      </div>
      {/* Profile card: banner + avatar + fields */}
      <div className="bg-[var(--surface-1)] rounded-xl border border-[var(--border)] overflow-hidden mb-4">
        <Shimmer className="h-20 w-full rounded-none" />
        <div className="p-5 space-y-3">
          <div className="flex items-center gap-3 -mt-10">
            <div className="w-16 h-16 rounded-full bg-[var(--surface-3)] border-4 border-[var(--surface-1)]" />
            <div className="mt-8 space-y-1.5">
              <Shimmer className="h-4 w-36" />
              <Shimmer className="h-3 w-48" />
            </div>
          </div>
          <Shimmer className="h-4 w-24" />
        </div>
      </div>
      {/* Secondary cards */}
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="bg-[var(--surface-1)] rounded-xl border border-[var(--border)] p-5 mb-4 space-y-3">
          <Shimmer className="h-4 w-32" />
          <Shimmer className="h-3 w-56" />
          <Shimmer className="h-10 w-full rounded-lg" />
        </div>
      ))}
    </div>
  );
}
