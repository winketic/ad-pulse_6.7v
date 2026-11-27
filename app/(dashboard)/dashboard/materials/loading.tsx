export default function MaterialsLoading() {
  return (
    <div className="p-4 sm:p-6 animate-pulse">
      <div className="flex items-center justify-between mb-6">
        <div className="h-8 w-40 bg-gray-200 rounded-lg" />
        <div className="h-9 w-36 bg-gray-200 rounded-lg" />
      </div>
      <div className="bg-[var(--surface-1)] rounded-xl border border-[var(--border)] overflow-hidden">
        <div className="h-12 bg-[var(--surface-2)] border-b border-[var(--border)]" />
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-14 border-b border-gray-50 px-4 flex items-center gap-4">
            <div className="h-4 w-48 bg-gray-100 rounded" />
            <div className="h-4 w-16 bg-gray-100 rounded ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
