"use client";

import { useState } from "react";

export default function ResubscribeButton() {
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [msg, setMsg] = useState("");

  const handle = async () => {
    setStatus("loading");
    setMsg("");
    try {
      const res = await fetch("/api/wazzup/resubscribe", { method: "POST" });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || data.error) {
        setStatus("error");
        setMsg(data.error ?? "Ошибка");
      } else {
        setStatus("ok");
        setMsg("Webhook переподключён");
        setTimeout(() => setStatus("idle"), 4000);
      }
    } catch {
      setStatus("error");
      setMsg("Ошибка сети");
    }
  };

  return (
    <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-5">
      <h3 className="text-sm font-semibold text-[var(--text)] mb-1">Webhook Wazzup</h3>
      <p className="text-xs text-[var(--muted)] mb-4">
        Переподключить webhook если сообщения не приходят после OAuth
      </p>
      <button
        onClick={handle}
        disabled={status === "loading"}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--bg3)] border border-[var(--border)] text-sm text-[var(--text)] hover:border-[#00f5c4] hover:text-[#00f5c4] disabled:opacity-50 transition-colors"
      >
        {status === "loading" ? (
          <>
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Подключение…
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Переподключить webhook
          </>
        )}
      </button>
      {msg && (
        <p className={`mt-2 text-xs ${status === "error" ? "text-red-400" : "text-[#00f5c4]"}`}>
          {msg}
        </p>
      )}
    </div>
  );
}
