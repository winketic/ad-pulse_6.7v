"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "adpulse-theme";

/** Тема уже применена inline-скриптом в layout — здесь только переключение. */
function currentTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export default function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(currentTheme());
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // приватный режим — тема просто не запомнится
    }
  }

  const label = theme === "dark" ? "Светлая тема" : "Тёмная тема";

  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      className={`inline-flex items-center justify-center w-9 h-9 rounded-lg transition-colors hover:bg-[var(--surface-3)] ${className}`}
      style={{ color: "var(--muted)" }}
    >
      {theme === "dark" ? (
        // солнце — переключение на светлую
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <circle cx="12" cy="12" r="4" />
          <path strokeLinecap="round" d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
        </svg>
      ) : (
        // луна — переключение на тёмную
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.8A8.5 8.5 0 1111.2 3a6.6 6.6 0 009.8 9.8z" />
        </svg>
      )}
    </button>
  );
}
