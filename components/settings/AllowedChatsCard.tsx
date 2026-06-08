"use client";

import { useState } from "react";

interface AllowedChatsCardProps {
  initialChatIds: string[];
}

export default function AllowedChatsCard({ initialChatIds }: AllowedChatsCardProps) {
  const [chatIds, setChatIds] = useState<string[]>(initialChatIds);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const add = async () => {
    const id = input.trim();
    if (!id) return;
    if (chatIds.includes(id)) { setError("Уже в списке"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/wazzup/allowed-chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: id }),
      });
      const data = await res.json() as { allowed_chat_ids?: string[]; error?: string };
      if (!res.ok) { setError(data.error ?? "Ошибка"); return; }
      setChatIds(data.allowed_chat_ids ?? []);
      setInput("");
    } catch { setError("Ошибка сети"); }
    finally { setLoading(false); }
  };

  const remove = async (id: string) => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/wazzup/allowed-chats", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: id }),
      });
      const data = await res.json() as { allowed_chat_ids?: string[] };
      if (res.ok) setChatIds(data.allowed_chat_ids ?? []);
    } catch { setError("Ошибка сети"); }
    finally { setLoading(false); }
  };

  return (
    <div className="bg-[#111111] rounded-xl border border-[#1f1f1f] p-5">
      <h3 className="text-sm font-semibold text-[#ededed] mb-1">Разрешённые чаты</h3>
      <p className="text-xs text-[#888888] mb-4">
        {chatIds.length === 0
          ? "Список пуст — обрабатываются все входящие сообщения"
          : "Обрабатываются только сообщения из этих чатов"}
      </p>

      {chatIds.length > 0 && (
        <div className="flex flex-col gap-2 mb-4">
          {chatIds.map((id) => (
            <div key={id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-[#161616] border border-[#1f1f1f]">
              <span className="text-xs text-[#ededed] font-mono truncate">{id}</span>
              <button
                onClick={() => remove(id)}
                disabled={loading}
                className="text-[#888888] hover:text-red-400 transition-colors shrink-0 disabled:opacity-50"
                title="Удалить"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="79001234567 или ID группы"
          className="flex-1 px-3 py-2 rounded-lg bg-[#161616] border border-[#1f1f1f] text-sm text-[#ededed] placeholder-[#888888] focus:outline-none focus:border-[#00f5c4]"
        />
        <button
          onClick={add}
          disabled={loading || !input.trim()}
          className="px-4 py-2 rounded-lg bg-[#00f5c4] text-[#0a0a0a] text-sm font-medium hover:bg-[#00ddb3] disabled:opacity-50 transition-colors shrink-0"
        >
          Добавить
        </button>
      </div>
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </div>
  );
}
