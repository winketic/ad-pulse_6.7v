"use server";

import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { submitSupportRequest, type SupportResult } from "@/lib/support/submit";

export async function sendSupportMessage(form: { subject: string; message: string }): Promise<SupportResult> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) throw new Error("Сессия истекла — войдите заново");

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id, full_name")
    .eq("id", user.id)
    .maybeSingle();

  let companyName: string | null = null;
  if (profile?.company_id) {
    const service = createServiceClient();
    const { data: company } = await service
      .from("companies")
      .select("name")
      .eq("id", profile.company_id)
      .maybeSingle();
    companyName = company?.name ?? null;
  }

  return submitSupportRequest({
    name: profile?.full_name ?? null,
    email: user.email,
    subject: form?.subject,
    message: form?.message,
    source: "dashboard",
    companyId: profile?.company_id ?? null,
    userId: user.id,
    companyName,
  });
}
