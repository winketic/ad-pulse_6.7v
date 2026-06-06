export default function WhatsAppLoading() {
  return (
    <div className="p-6 animate-pulse">
      <div className="h-7 w-32 bg-gray-200 rounded-lg mb-1" />
      <div className="h-4 w-64 bg-gray-100 rounded mb-6" />
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="h-11 bg-gray-50 border-b border-gray-100" />
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-14 border-b border-gray-50 px-4 flex items-center gap-4">
            <div className="h-4 w-24 bg-gray-100 rounded" />
            <div className="h-4 w-28 bg-gray-100 rounded" />
            <div className="h-4 flex-1 bg-gray-100 rounded" />
            <div className="h-5 w-24 bg-gray-100 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
