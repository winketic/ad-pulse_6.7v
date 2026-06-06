"use client";

export default function SettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-5">
        <h2 className="text-sm font-semibold text-red-800 mb-2">
          Ошибка загрузки настроек
        </h2>
        <p className="text-sm text-red-700 font-mono break-all">
          {error.message || "Неизвестная ошибка"}
        </p>
        {error.digest && (
          <p className="text-xs text-red-400 mt-1">digest: {error.digest}</p>
        )}
        <button
          onClick={reset}
          className="mt-4 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700"
        >
          Попробовать снова
        </button>
      </div>
    </div>
  );
}
