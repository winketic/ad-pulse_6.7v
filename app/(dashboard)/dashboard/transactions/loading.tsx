export default function TransactionsLoading() {
  return (
    <div className="p-4 sm:p-6 animate-pulse">
      <div className="flex items-center justify-between mb-6">
        <div className="h-8 w-44 bg-gray-200 rounded-lg" />
        <div className="h-9 w-40 bg-gray-200 rounded-lg" />
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="h-12 bg-gray-50 border-b border-gray-100" />
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-14 border-b border-gray-50 px-4 flex items-center gap-4">
            <div className="h-5 w-16 bg-gray-100 rounded-full" />
            <div className="h-4 w-36 bg-gray-100 rounded" />
            <div className="h-4 w-20 bg-gray-100 rounded ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
