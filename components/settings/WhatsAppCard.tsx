"use client";

import Link from "next/link";

/**
 * Карточка WhatsApp в настройках компании.
 * Номер привязывается к нашему шлюзу по QR, чаты для разбора
 * выбираются на экране подключения.
 */
export default function WhatsAppCard({
  isConnected,
  phoneNumber,
  isAdmin,
}: {
  isConnected: boolean;
  phoneNumber: string | null;
  isAdmin: boolean;
}) {
  return (
    <section
      className="rounded-2xl p-5"
      style={{ background: "var(--card)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-[var(--text)]">
            WhatsApp
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {isConnected
              ? `Подключён${phoneNumber ? `: +${phoneNumber}` : ""}. Сообщения из отмеченных чатов разбираются автоматически.`
              : "Номер не подключён. Привяжите его по QR-коду, чтобы учитывать материалы из чатов."}
          </p>
        </div>

        <span
          className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium"
          style={{
            background: isConnected
              ? "color-mix(in srgb, #25D366 18%, transparent)"
              : "var(--bg3)",
            color: isConnected ? "#25D366" : "var(--muted)",
          }}
        >
          {isConnected ? "Активно" : "Не подключено"}
        </span>
      </div>

      {isAdmin && (
        <Link
          href="/dashboard/whatsapp/connect"
          className="dp-btn-primary mt-4 inline-flex items-center justify-center px-4 py-2 text-sm"
        >
          {isConnected ? "Управление подключением" : "Подключить WhatsApp"}
        </Link>
      )}
    </section>
  );
}
