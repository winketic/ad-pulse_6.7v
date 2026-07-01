export default function WarehouseLoading() {
  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto animate-pulse">
      <div className="h-8 w-36 bg-[var(--bg3)] rounded-lg mb-2" />
      <div className="h-4 w-52 bg-[var(--bg3)] rounded mb-6" />
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 rounded-xl bg-[var(--bg3)]" />
        ))}
      </div>
    </div>
  );
}
