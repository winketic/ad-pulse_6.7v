import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import WhatsAppList, { type WazzupMessage, type WazzupMaterial } from "./WhatsAppList";
import AllowedChatsCard from "@/components/settings/AllowedChatsCard";

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

  const [messagesResult, materialsResult, tokenResult] = await Promise.all([
    service
      .from("wazzup_messages")
      .select(
        "id, sender_phone, raw_text, parsed, needs_review, parse_result, created_at"
      )
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(50),
    service
      .from("materials")
      .select("id, name, unit")
      .eq("company_id", companyId)
      .order("name"),
    service
      .from("wazzup_tokens")
      .select("channel_ids, webhook_id")
      .eq("company_id", companyId)
      .maybeSingle(),
  ]);

  const channelIds: string[] = tokenResult.data?.channel_ids ?? [];
  const webhookId: string | null = tokenResult.data?.webhook_id ?? null;

  // Allowed chats config
  const { data: wazzupCfg } = await service
    .from("wazzup_config")
    .select("allowed_chat_ids")
    .eq("company_id", companyId)
    .maybeSingle();
  const allowedChatIds: string[] = wazzupCfg?.allowed_chat_ids ?? [];

  return (
    <div className="space-y-4">
      {isAdmin && (
        <div className="px-6 pt-6">
          <AllowedChatsCard initialChatIds={allowedChatIds} />
        </div>
      )}
      <WhatsAppList
      messages={(messagesResult.data ?? []) as WazzupMessage[]}
      materials={(materialsResult.data ?? []) as WazzupMaterial[]}
      channelIds={channelIds}
      webhookId={webhookId}
      companyId={companyId}
    />
    </div>
  );
}
