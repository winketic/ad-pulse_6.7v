"use client";

import { useState, useTransition } from "react";
import { saveThreshold, deleteThreshold } from "@/app/(dashboard)/dashboard/settings/thresholdActions";

type Material = { id: string; name: string; unit: string };
type Threshold = { material_id: string; min_quantity: number };

interface Props {
  materials: Material[];
  initialThresholds: Threshold[];
}

export function MaterialThresholds({ materials, initialThresholds }: Props) {
  const [thresholds, setThresholds] = useState<Record<string, number>>(
    Object.fromEntries(initialThresholds.map((t) => [t.material_id, t.min_quantity]))
  );
  const [editing, setEditing] = useState<string | null>(null);
  const [inputVal, setInputVal] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function startEdit(matId: string) {
    setEditing(matId);
    setInputVal(thresholds[matId]?.toString() ?? "");
    setError("");
  }

  function handleSave(matId: string, unit: string) {
    const val = parseFloat(inputVal);
    if (isNaN(val) || val < 0) { setError("Введите корректное число >= 0"); return; }
    setError("");
    startTransition(async () => {
      const res = await saveThreshold(matId, val);
      if ("error" in res) { setError(res.error); return; }
      setThresholds((prev) => ({ ...prev, [matId]: val }));
      setEditing(null);
    });
    void unit;
  }

  function handleDelete(matId: string) {
    startTransition(async () => {
      await deleteThreshold(matId);
      setThresholds((prev) => {
        const next = { ...prev };
        delete next[matId];
        return next;
      });
      setEditing(null);
    });
  }

  if (materials.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)] py-4">Добавьте материалы для настройки порогов.</p>
    );
  }

  return (
    <div className="space-y-2">
      {error && (
        <p className="text-xs text-red-400 px-1">{error}</p>
      )}
      {materials.map((mat) => {
        const current = thresholds[mat.id];
        const isEditing = editing === mat.id;

        return (
          <div key={mat.id}
            className="flex items-center gap-3 px-4 py-3 rounded-xl"
            style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--text)] truncate">{mat.name}</p>
              {current != null ? (
                <p className="text-xs" style={{ color: "#00f5c4" }}>
                  Алерт при остатке &lt; {current} {mat.unit}
                </p>
              ) : (
                <p className="text-xs text-[var(--muted)]">Порог не задан</p>
              )}
            </div>

            {isEditing ? (
              <div className="flex items-center gap-2 shrink-0">
                <input
                  type="number"
                  value={inputVal}
                  onChange={(e) => setInputVal(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSave(mat.id, mat.unit); if (e.key === "Escape") setEditing(null); }}
                  autoFocus
                  min={0}
                  step="any"
                  className="w-24 px-2 py-1 text-sm rounded-lg outline-none text-right"
                  style={{ background: "#1a1a2e", border: "1px solid #00f5c4", color: "#f9fafb" }}
                />
                <span className="text-xs text-[var(--muted)]">{mat.unit}</span>
                <button
                  onClick={() => handleSave(mat.id, mat.unit)}
                  disabled={isPending}
                  className="px-3 py-1 text-xs rounded-lg font-medium"
                  style={{ background: "#00f5c4", color: "#05050a" }}
                >
                  ОК
                </button>
                {current != null && (
                  <button
                    onClick={() => handleDelete(mat.id)}
                    disabled={isPending}
                    className="px-2 py-1 text-xs rounded-lg"
                    style={{ background: "#2d1515", color: "#f87171" }}
                  >
                    ✕
                  </button>
                )}
                <button onClick={() => setEditing(null)} className="text-xs text-[var(--muted)]">
                  Отмена
                </button>
              </div>
            ) : (
              <button
                onClick={() => startEdit(mat.id)}
                className="shrink-0 px-3 py-1.5 text-xs rounded-lg"
                style={{ background: "#1a1a2e", color: "#9ca3af", border: "1px solid #2a2a3d" }}
              >
                {current != null ? "Изменить" : "Задать"}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
