"use client";

import { useEffect } from "react";

export default function GlobalRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Ошибка на странице приложения:", error);
  }, [error]);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-5 py-5">
        <h2 className="text-sm font-semibold text-red-400 mb-2">
          Не удалось загрузить данные
        </h2>
        <p className="text-sm text-[var(--muted)]">
          Не удалось загрузить страницу. Попробуйте повторить — если ошибка
          повторится, обновите страницу позже.
        </p>
        {error.digest && (
          <p className="text-xs text-[var(--muted)] mt-1 font-mono">
            digest: {error.digest}
          </p>
        )}
        <button
          type="button"
          onClick={reset}
          className="mt-4 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors"
        >
          Попробовать снова
        </button>
      </div>
    </div>
  );
}
