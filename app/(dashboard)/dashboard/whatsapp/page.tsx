import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import WhatsAppList, { type WazzupMessage, type WazzupMaterial } from "./WhatsAppList";

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
    .select("company_id")
    .eq("id", user.id)
    .single();

  // No company yet — show empty state rather than redirecting
  if (!profile?.company_id) {
    return (
      <WhatsAppList messages={[]} materials={[]} />
    );
  }

  const companyId = profile.company_id as string;
  const service = createServiceClient();

  const [messagesResult, materialsResult] = await Promise.all([
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
  ]);

  return (
    <WhatsAppList
      messages={(messagesResult.data ?? []) as WazzupMessage[]}
      materials={(materialsResult.data ?? []) as WazzupMaterial[]}
    />
  );
}
