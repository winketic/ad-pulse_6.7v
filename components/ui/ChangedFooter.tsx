import type { LastChange } from "@/lib/audit/getLastChange";

const ACTION_LABEL: Record<LastChange["action"], string> = {
  insert: "Создано",
  update: "Изменено",
  delete: "Удалено",
};

export default function ChangedFooter({ change }: { change: LastChange | null }) {
  if (!change) return null;

  const formatted = new Date(change.changedAt).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <p className="text-xs text-[var(--muted)] mt-4 pt-3 border-t border-[var(--border)]">
      {ACTION_LABEL[change.action]} {change.changedByName} {formatted}
    </p>
  );
}
