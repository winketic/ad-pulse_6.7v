function Shimmer({ className }: { className: string }) {
  return <div className={`rounded-lg bg-[var(--bg3)] ${className}`} />;
}

export default function WhatsAppLoading() {
  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto animate-pulse">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="space-y-2">
          <Shimmer className="h-7 w-32" />
          <Shimmer className="h-4 w-52" />
        </div>
        <Shimmer className="h-10 w-10 sm:w-28 rounded-lg shrink-0" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl mb-5" style={{ background: "var(--bg3)", border: "1px solid var(--border)" }}>
        <Shimmer className="h-9 flex-1 rounded-lg" />
        <Shimmer className="h-9 flex-1 rounded-lg" />
      </div>

      {/* Queue cards */}
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-[var(--card)] rounded-xl border border-[var(--border)] overflow-hidden">
            <div className="px-4 pt-3.5 pb-3 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1.5">
                  <Shimmer className="h-4 w-36" />
                  <Shimmer className="h-3 w-24" />
                </div>
                <Shimmer className="h-5 w-24 rounded-full" />
              </div>
              <Shimmer className="h-4 w-full" />
              <Shimmer className="h-3 w-40" />
            </div>
            <div className="px-4 py-2 border-t border-[var(--border)] flex items-center justify-between gap-3">
              <Shimmer className="h-3 w-32" />
              <Shimmer className="h-7 w-20" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
