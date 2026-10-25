"use client";

import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";

// Кнопка «Обновить» для серверных страниц.
// router.refresh() заново выполняет серверный рендер и сбрасывает клиентский
// router cache. <Link href="{текущий url}"> этого НЕ делает: кэш отдаёт тот же
// ответ, и клик ничего не перезапрашивает.
export default function RefreshButton({
  children = "Обновить",
  className = "",
}: {
  children?: ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      onClick={() => startTransition(() => router.refresh())}
      disabled={isPending}
      className={className}
    >
      {children}
    </button>
  );
}
