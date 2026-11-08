import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import WhatsAppList, { type WhatsAppMessage, type WhatsAppMaterial } from "./WhatsAppList";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function WhatsAppPage() {
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

  // No company yet — show empty state rather than redirecting
  if (!profile?.company_id) {
    return (
      <WhatsAppList messages={[]} materials={[]} />
    );
  }

  const companyId = profile.company_id as string;
  const service = createServiceClient();

  const [messagesResult, materialsResult, profilesResult] = await Promise.all([
    service
      .from("whatsapp_messages")
      .select(
        "id, chat_id, chat_name, sender_phone, raw_text, parsed, needs_review, parse_result, created_at, content_type, media_url"
      )
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(50),
    service
      .from("materials")
      .select("id, name, unit")
      .eq("company_id", companyId)
      .order("name"),
    // Profiles with phone for sender name lookup
    service
      .from("profiles")
      .select("id, full_name, position, phone")
      .eq("company_id", companyId)
      .not("phone", "is", null),
  ]);

  // Собственный шлюз: select("*") — переживаем окно до применения миграции 054.
  let gatewaySession: Record<string, unknown> | null = null;
  try {
    const { data } = await service
      .from("whatsapp_sessions")
      .select("*")
      .eq("company_id", companyId)
      .maybeSingle();
    gatewaySession = data ?? null;
  } catch (err) {
    console.warn("[whatsapp/page] whatsapp_sessions недоступна:", err);
  }

  // phone → {name, position} for sender display
  const senderMap: Record<string, { name: string; position: string | null }> = {};
  for (const p of profilesResult.data ?? []) {
    if (p.phone) {
      senderMap[p.phone] = { name: p.full_name, position: p.position ?? null };
    }
  }

  return (
    <WhatsAppList
      messages={(messagesResult.data ?? []) as WhatsAppMessage[]}
      materials={(materialsResult.data ?? []) as WhatsAppMaterial[]}
      companyId={companyId}
      isAdmin={isAdmin}
      senderMap={senderMap}
      gatewayStatus={(gatewaySession?.status as string | undefined) ?? null}
      gatewayPhone={(gatewaySession?.phone_number as string | undefined) ?? null}
    />
  );
}
