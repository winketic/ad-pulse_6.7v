import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import SupportClient from "./SupportClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type TicketRow = { id: string; subject: string; status: string; created_at: string };

export default async function SupportPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id, full_name")
    .eq("id", user.id)
    .maybeSingle();

  let tickets: TicketRow[] = [];
  if (profile?.company_id) {
    const service = createServiceClient();
    const { data } = await service
      .from("support_requests")
      .select("id, subject, status, created_at")
      .eq("company_id", profile.company_id)
      .order("created_at", { ascending: false })
      .limit(5);
    tickets = (data ?? []) as TicketRow[];
  }

  return (
    <SupportClient tickets={tickets} />
  );
}
