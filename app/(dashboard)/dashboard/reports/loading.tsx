export default function ReportsLoading() {
  return (
    <div className="p-4 sm:p-6 animate-pulse">
      <div className="flex items-center justify-between mb-6">
        <div className="h-8 w-36 bg-gray-200 rounded-lg" />
        <div className="flex gap-2">
          <div className="h-9 w-32 bg-gray-200 rounded-lg" />
          <div className="h-9 w-32 bg-gray-200 rounded-lg" />
        </div>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
        <div className="h-12 bg-gray-50 border-b border-gray-100" />
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-12 border-b border-gray-50 px-4 flex items-center gap-4">
            <div className="h-4 w-40 bg-gray-100 rounded" />
            <div className="h-4 w-20 bg-gray-100 rounded ml-auto" />
            <div className="h-4 w-20 bg-gray-100 rounded" />
            <div className="h-4 w-24 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
