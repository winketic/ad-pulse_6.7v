"use client";

import { usePathname } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";

/**
 * Переключатель темы для страниц без дашборда (вход, регистрация,
 * восстановление пароля, приглашение, онбординг). Внутри дашборда
 * переключатель уже есть в шапке — там этот не показываем, чтобы
 * не было двух кнопок на экране.
 */
export default function PublicThemeToggle() {
  const pathname = usePathname() ?? "";
  const insideApp =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/onboarding");

  if (insideApp) return null;

  return (
    <div className="fixed right-4 z-[60]" style={{ top: "calc(1rem + env(safe-area-inset-top, 0px))" }}>
      <ThemeToggle />
    </div>
  );
}
