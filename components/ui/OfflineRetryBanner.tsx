"use client";

import { useState, useEffect } from "react";
import { loadPending, clearPending } from "@/lib/hooks/useOfflineRetry";
import { useToast } from "@/components/ui/Toast";

// Generic retry banner. Mount inside any page that has pendingKey.
// When the pending item exists and online, shows a sticky banner.
export function OfflineRetryBanner<T>({
  pendingKey,
  onRetry,
}: {
  pendingKey: string;
  onRetry: (payload: T) => Promise<void>;
}) {
  const { toast } = useToast();
  const [pending, setPending] = useState<{ label: string; payload: T } | null>(null);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const item = loadPending<T>(pendingKey);
    if (item) setPending({ label: item.label, payload: item.payload });
  }, [pendingKey]);

  // Also check on coming back online
  useEffect(() => {
    const handler = () => {
      const item = loadPending<T>(pendingKey);
      if (item) setPending({ label: item.label, payload: item.payload });
    };
    window.addEventListener("online", handler);
    return () => window.removeEventListener("online", handler);
  }, [pendingKey]);

  if (!pending) return null;

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await onRetry(pending.payload);
      clearPending(pendingKey);
      setPending(null);
      toast("Запись восстановлена", "success");
    } catch {
      toast("Повтор не удался — проверьте связь", "error");
    } finally {
      setRetrying(false);
    }
  };

  const handleDismiss = () => {
    clearPending(pendingKey);
    setPending(null);
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-[80] flex items-center gap-3 px-4 py-3 bg-amber-500 text-amber-950 text-sm font-medium shadow-lg"
      style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top, 0px))" }}
    >
      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <span className="flex-1 min-w-0 truncate">Не сохранено: {pending.label}</span>
      <button
        onClick={handleRetry}
        disabled={retrying}
        className="shrink-0 px-3 py-1 rounded-lg bg-amber-950/15 hover:bg-amber-950/25 transition-colors font-semibold disabled:opacity-50"
      >
        {retrying ? "..." : "Повторить"}
      </button>
      <button onClick={handleDismiss} className="shrink-0 p-0.5 rounded hover:bg-amber-950/15">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
