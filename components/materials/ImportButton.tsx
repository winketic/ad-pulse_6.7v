"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function ImportButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError("");
    setResult(null);

    const fd = new FormData();
    fd.append("file", file);

    try {
      const res = await fetch("/api/materials/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error ?? "Ошибка импорта");
      } else {
        setResult({ imported: data.imported, skipped: data.skipped });
        router.refresh();
      }
    } catch {
      setError("Ошибка соединения");
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleFile}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
        style={{ background: "#1a1a2e", color: "#9ca3af", border: "1px solid #2a2a3d" }}
      >
        {loading ? (
          <>
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Импортируем…
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Импорт Excel / CSV
          </>
        )}
      </button>
      {result && (
        <p className="text-xs" style={{ color: "#00f5c4" }}>
          Импортировано: {result.imported}{result.skipped > 0 ? `, пропущено: ${result.skipped}` : ""}
        </p>
      )}
      {error && (
        <p className="text-xs" style={{ color: "#f87171" }}>{error}</p>
      )}
      <p className="text-xs" style={{ color: "#4b5563" }}>
        Формат: колонки «Название» и «Единица». Дубликаты пропускаются.
      </p>
    </div>
  );
}
