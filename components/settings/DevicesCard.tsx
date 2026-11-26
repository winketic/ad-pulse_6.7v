"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type Device = {
  id: string;
  ip: string | null;
  user_agent: string | null;
  last_seen_at: string;
  trusted: boolean;
};

function shortAgent(value: string | null): string {
  if (!value) return "Неизвестное устройство";
  if (/iphone|ipad/i.test(value)) return "iPhone / iPad";
  if (/android/i.test(value)) return "Android";
  if (/macintosh|mac os/i.test(value)) return "Mac";
  if (/windows/i.test(value)) return "Windows";
  if (/linux/i.test(value)) return "Linux";
  return value.slice(0, 60);
}

export default function DevicesCard({ devices }: { devices: Device[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function forget(id: string) {
    setBusy(id);
    setError("");
    const { error: deleteError } = await supabase.from("user_devices").delete().eq("id", id);
    if (deleteError) setError("Не удалось удалить устройство");
    setBusy(null);
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
      <h3 className="text-sm font-semibold text-[var(--text)] mb-1">Устройства и IP</h3>
      <p className="text-xs text-[var(--muted)] mb-4">
        Вход с нового IP или браузера присылает письмо на почту аккаунта. Устройство можно забыть —
        при следующем входе оно снова станет новым.
      </p>

      {error && <p className="text-xs text-[var(--danger)] mb-3">{error}</p>}

      {devices.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">Пока нет записей. Они появятся после следующего входа.</p>
      ) : (
        <div className="space-y-2">
          {devices.map((device) => (
            <div
              key={device.id}
              className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5"
              style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
            >
              <div className="min-w-0">
                <p className="text-sm text-[var(--text)]">{shortAgent(device.user_agent)}</p>
                <p className="text-xs text-[var(--muted)]">
                  {device.ip ?? "IP не определён"} ·{" "}
                  {new Date(device.last_seen_at).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              <button
                onClick={() => forget(device.id)}
                disabled={busy === device.id}
                className="text-xs text-[var(--muted)] hover:text-[var(--text)] underline disabled:opacity-50"
              >
                {busy === device.id ? "…" : "Забыть"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
