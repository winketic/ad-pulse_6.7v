export default function WhatsAppLoading() {
  return (
    <div className="p-6 animate-pulse">
      <div className="h-7 w-32 bg-[var(--surface-3)] rounded-lg mb-1" />
      <div className="h-4 w-64 bg-[var(--surface-2)] rounded mb-6" />
      <div className="bg-[var(--surface-1)] rounded-xl border border-[var(--border)] overflow-hidden">
        <div className="h-11 bg-[var(--surface-2)] border-b border-[var(--border)]" />
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-14 border-b border-[var(--border)] px-4 flex items-center gap-4">
            <div className="h-4 w-24 bg-[var(--surface-2)] rounded" />
            <div className="h-4 w-28 bg-[var(--surface-2)] rounded" />
            <div className="h-4 flex-1 bg-[var(--surface-2)] rounded" />
            <div className="h-5 w-24 bg-[var(--surface-2)] rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
