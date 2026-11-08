import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { gatewayConfigured, getSession } from "@/lib/whatsapp/gateway";
import ConnectClient from "./ConnectClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function WhatsAppConnectPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id, role")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.role === "admin";
  const companyId = (profile?.company_id as string | undefined) ?? null;

  // Статус подключения читаем на сервере, чтобы страница сразу рисовала
  // правильное состояние. Иначе при загрузке на мгновение появлялась кнопка
  // «Подключить WhatsApp», хотя номер уже привязан.
  let initialSession = null;
  if (isAdmin && companyId && gatewayConfigured()) {
    try {
      initialSession = await getSession(companyId);
    } catch (err) {
      console.warn("[whatsapp/connect] статус шлюза недоступен:", err);
    }
  }

  let initialLastMessageAt: string | null = null;
  if (companyId) {
    try {
      const service = createServiceClient();
      const { data } = await service
        .from("whatsapp_messages")
        .select("created_at")
        .eq("company_id", companyId)
        .eq("provider", "adpulse-gateway")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      initialLastMessageAt = data?.created_at ?? null;
    } catch {
      // таблицы может не быть до миграции — не критично
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <div className="mb-5">
        <Link
          href="/dashboard/whatsapp"
          className="text-sm"
          style={{ color: "var(--muted)" }}
        >
          ← Сообщения WhatsApp
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Подключение WhatsApp</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          Привяжите номер клиента и выберите чаты, из которых AD Pulse будет
          создавать движения материалов.
        </p>
      </div>

      {isAdmin ? (
        <ConnectClient
          initialSession={initialSession}
          initialLastMessageAt={initialLastMessageAt}
        />
      ) : (
        <div
          className="rounded-xl p-4 text-sm"
          style={{ background: "var(--card)", border: "1px solid var(--border)" }}
        >
          Подключать WhatsApp может только администратор компании.
        </div>
      )}
    </div>
  );
}
