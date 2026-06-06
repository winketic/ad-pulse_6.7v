export default function PlansLoading() {
  return (
    <div className="p-4 sm:p-6 animate-pulse">
      <div className="flex items-center justify-between mb-6">
        <div className="h-8 w-48 bg-gray-200 rounded-lg" />
        <div className="h-9 w-36 bg-gray-200 rounded-lg" />
      </div>
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 h-20 flex items-center gap-4">
            <div className="h-4 w-48 bg-gray-100 rounded" />
            <div className="h-3 w-32 bg-gray-100 rounded ml-auto" />
            <div className="h-6 w-20 bg-gray-100 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
