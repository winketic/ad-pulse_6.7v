"use client";

import { useTheme } from "@/lib/theme";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div
      className="rounded-xl p-5 mt-4"
      style={{ background: "var(--card)", border: "1px solid var(--border)" }}
    >
      <h3 className="text-sm font-semibold mb-1" style={{ color: "var(--text)" }}>
        Внешний вид
      </h3>
      <p className="text-xs mb-4" style={{ color: "var(--muted)" }}>
        Выберите цветовую тему интерфейса
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => theme === "light" && toggleTheme()}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
          style={{
            background: theme === "dark" ? "var(--bg3)" : "transparent",
            border: `1px solid ${theme === "dark" ? "var(--accent)" : "var(--border)"}`,
            color: theme === "dark" ? "var(--text)" : "var(--muted)",
          }}
        >
          🌙 Тёмная
        </button>
        <button
          onClick={() => theme === "dark" && toggleTheme()}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
          style={{
            background: theme === "light" ? "var(--bg3)" : "transparent",
            border: `1px solid ${theme === "light" ? "var(--accent)" : "var(--border)"}`,
            color: theme === "light" ? "var(--text)" : "var(--muted)",
          }}
        >
          ☀️ Светлая
        </button>
      </div>
    </div>
  );
}
