export default function DashboardLoading() {
  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto animate-pulse">
      <div className="h-8 w-56 bg-gray-200 rounded-lg mb-1" />
      <div className="h-4 w-40 bg-gray-100 rounded mb-6" />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 h-24" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-4">
        <div className="lg:col-span-3 bg-white rounded-xl border border-gray-200 h-64" />
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 h-64" />
      </div>
      <div className="bg-white rounded-xl border border-gray-200 h-40" />
    </div>
  );
}
