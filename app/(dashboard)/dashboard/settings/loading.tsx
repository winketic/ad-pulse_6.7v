export default function SettingsLoading() {
  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto animate-pulse">
      <div className="h-8 w-32 bg-gray-200 rounded-lg mb-1" />
      <div className="h-4 w-56 bg-gray-100 rounded mb-6" />
      <div className="space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 h-32" />
        ))}
      </div>
    </div>
  );
}
