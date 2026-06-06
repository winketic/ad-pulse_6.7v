export default function PlanDetailLoading() {
  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto animate-pulse">
      <div className="h-4 w-32 bg-gray-100 rounded mb-4" />
      <div className="h-8 w-64 bg-gray-200 rounded-lg mb-6" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 h-20" />
        ))}
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="h-12 bg-gray-50 border-b border-gray-100" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-14 border-b border-gray-50 px-4 flex items-center gap-4">
            <div className="h-4 w-44 bg-gray-100 rounded" />
            <div className="flex-1 h-2 bg-gray-100 rounded-full mx-4" />
            <div className="h-4 w-20 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
