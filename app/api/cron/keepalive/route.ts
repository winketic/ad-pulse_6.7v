import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

// Supabase free tier ставит проект на паузу после ~недели без запросов к БД —
// приложение целиком перестаёт пускать пользователей. Vercel Cron дёргает этот
// маршрут раз в день: один лёгкий запрос, данные наружу не отдаются.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Если CRON_SECRET задан — Vercel шлёт его в Authorization, проверяем.
  // Если не задан — пингуем всё равно (fail-open): маршрут ничего не раскрывает,
  // а без пинга проект снова уснёт.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!cronSecret) {
    console.warn("[cron/keepalive] CRON_SECRET not configured — running unauthenticated");
  }

  const { error } = await createServiceClient()
    .from("companies")
    .select("id", { count: "exact", head: true })
    .limit(1);

  if (error) {
    console.error("[cron/keepalive] DB ping failed:", error.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
