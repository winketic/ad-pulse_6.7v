import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getAdminCompany } from "@/lib/whatsapp/auth";
import {
  GatewayError,
  gatewayConfigured,
  getSession,
  logoutSession,
  startSession,
  type GatewaySession,
} from "@/lib/whatsapp/gateway";

export const dynamic = "force-dynamic";

/** Сохранить состояние сессии в БД, чтобы UI показывал его без обращения к шлюзу. */
async function persist(companyId: string, session: GatewaySession): Promise<void> {
  const service = createServiceClient();
  const { error } = await service.from("whatsapp_sessions").upsert(
    {
      company_id: companyId,
      phone_number: session.phoneNumber,
      push_name: session.pushName,
      status: session.status,
      connected_at: session.connectedAt,
      last_seen_at: new Date().toISOString(),
      last_error: session.lastError,
    },
    { onConflict: "company_id" }
  );
  // Таблица появляется миграцией 054 — до её применения просто не пишем в БД.
  if (error) console.warn("[whatsapp/session] persist skipped:", error.message);
}

function fail(err: unknown) {
  if (err instanceof GatewayError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error("[whatsapp/session]", err);
  return NextResponse.json({ error: "Ошибка шлюза WhatsApp" }, { status: 502 });
}

// GET — текущий статус подключения
export async function GET() {
  const companyId = await getAdminCompany();
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!gatewayConfigured()) {
    return NextResponse.json({ connected: false, configured: false, session: null });
  }

  try {
    const session = await getSession(companyId);
    if (!session) return NextResponse.json({ connected: false, configured: true, session: null });
    await persist(companyId, session);
    return NextResponse.json({
      connected: session.status === "open",
      configured: true,
      session,
    });
  } catch (err) {
    return fail(err);
  }
}

// POST — начать подключение (создаёт сессию и возвращает QR)
export async function POST() {
  const companyId = await getAdminCompany();
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const session = await startSession(companyId);
    await persist(companyId, session);
    return NextResponse.json({ session });
  } catch (err) {
    return fail(err);
  }
}

// DELETE — отвязать номер
export async function DELETE() {
  const companyId = await getAdminCompany();
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await logoutSession(companyId);
    const service = createServiceClient();
    await service
      .from("whatsapp_sessions")
      .update({ status: "logged_out", phone_number: null, updated_at: new Date().toISOString() })
      .eq("company_id", companyId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
