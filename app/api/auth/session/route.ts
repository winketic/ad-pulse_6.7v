import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendNewDeviceEmail } from "@/lib/billing/emails";

export const dynamic = "force-dynamic";

type DeviceRow = { id: string; ip: string | null; user_agent: string | null; first_seen_at: string };

/**
 * Фиксирует устройство и IP входа. Первая пара IP+user-agent создаёт запись
 * и письмо владельцу аккаунта. Повторные входы только обновляют last_seen_at.
 */
export async function POST() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ ok: false }, { status: 401 });

  const headerStore = await headers();
  const ip = (headerStore.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || null;
  const userAgent = (headerStore.get("user-agent") ?? "").slice(0, 200) || null;

  const service = createServiceClient();
  const { data: rows, error } = await service
    .from("user_devices")
    .select("id, ip, user_agent, first_seen_at")
    .eq("user_id", user.id);

  // Миграция 059 ещё не применена — вход не ломаем, только пишем в лог.
  if (error) {
    console.error("[session] user_devices недоступна:", error.message);
    return NextResponse.json({ ok: false, skipped: true });
  }

  const devices = (rows ?? []) as DeviceRow[];
  const known = devices.find(
    (row) => (row.ip ?? null) === ip && (row.user_agent ?? null) === userAgent,
  );

  if (known) {
    await service
      .from("user_devices")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", known.id);
    return NextResponse.json({ ok: true, known: true });
  }

  const { data: inserted, error: insertError } = await service
    .from("user_devices")
    .insert({ user_id: user.id, ip, user_agent: userAgent })
    .select("id")
    .single();

  if (insertError) {
    console.error("[session] не удалось записать устройство:", insertError.message);
    return NextResponse.json({ ok: false });
  }

  // Не больше одного письма в 10 минут на аккаунт: защита от шторма
  // уведомлений, если браузер каждый раз без cookie.
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  const recent = devices.some((row) => Date.parse(row.first_seen_at) > tenMinutesAgo);

  if (!recent) {
    try {
      await sendNewDeviceEmail({ to: user.email, ip, userAgent, at: new Date() });
      await service
        .from("user_devices")
        .update({ notified_at: new Date().toISOString() })
        .eq("id", inserted.id);
    } catch (emailError) {
      console.error("[session] письмо о новом входе не отправлено:", emailError);
    }
  }

  return NextResponse.json({ ok: true, known: false });
}
