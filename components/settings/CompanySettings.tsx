"use client";

import { useState, useTransition } from "react";
import { updateCompanyName } from "@/app/(dashboard)/dashboard/settings/actions";

interface CompanySettingsProps {
  companyId: string | null;
  companyName: string;
  canEdit: boolean;
}

export default function CompanySettings({
  companyId,
  companyName,
  canEdit,
}: CompanySettingsProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(companyName === "—" ? "" : companyName);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleSave = () => {
    setError("");
    startTransition(async () => {
      try {
        await updateCompanyName(value);
        setEditing(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ошибка сохранения");
      }
    });
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-900">Компания</h2>
        {canEdit && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-[#1a472a] hover:underline font-medium"
          >
            Изменить
          </button>
        )}
      </div>

      <div className="px-5 py-5 space-y-4">
        {editing ? (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Название компании
              </label>
              <input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Введите название"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a472a]/30 focus:border-[#1a472a]"
                autoFocus
              />
            </div>
            {error && (
              <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => { setEditing(false); setError(""); }}
                disabled={isPending}
                className="flex-1 min-h-[44px] px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={handleSave}
                disabled={isPending || !value.trim()}
                className="flex-1 min-h-[44px] px-4 py-2 rounded-lg bg-[#1a472a] text-white text-sm font-medium hover:bg-[#1a472a]/90 disabled:opacity-50 transition-colors"
              >
                {isPending ? "Сохранение…" : "Сохранить"}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-gray-400 mb-0.5">Название</p>
              <p className="text-sm font-medium text-gray-900">{companyName}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-400 mb-0.5">ID компании</p>
              <p className="text-xs text-gray-400 font-mono truncate">{companyId ?? "—"}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
