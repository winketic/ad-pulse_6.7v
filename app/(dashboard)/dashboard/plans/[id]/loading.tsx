export default function PlanDetailLoading() {
  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto animate-pulse">
      <div className="h-4 w-32 bg-[var(--surface-2)] rounded mb-4" />
      <div className="h-8 w-64 bg-[var(--surface-3)] rounded-lg mb-6" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-[var(--surface-1)] rounded-xl border border-[var(--border)] p-4 h-20" />
        ))}
      </div>
      <div className="bg-[var(--surface-1)] rounded-xl border border-[var(--border)] overflow-hidden">
        <div className="h-12 bg-[var(--surface-2)] border-b border-[var(--border)]" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-14 border-b border-[var(--border)] px-4 flex items-center gap-4">
            <div className="h-4 w-44 bg-[var(--surface-2)] rounded" />
            <div className="flex-1 h-2 bg-[var(--surface-2)] rounded-full mx-4" />
            <div className="h-4 w-20 bg-[var(--surface-2)] rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
