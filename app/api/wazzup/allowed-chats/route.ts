import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

async function getCompany() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id, role")
    .eq("id", user.id)
    .single();

  if (!profile?.company_id || profile.role !== "admin") return null;
  return profile.company_id as string;
}

// GET — return current allowed_chat_ids
export async function GET() {
  const companyId = await getCompany();
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data } = await service
    .from("wazzup_config")
    .select("allowed_chat_ids")
    .eq("company_id", companyId)
    .maybeSingle();

  return NextResponse.json({ allowed_chat_ids: data?.allowed_chat_ids ?? [] });
}

// POST — add a chatId
export async function POST(request: NextRequest) {
  const companyId = await getCompany();
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({})) as { chat_id?: string };
  const chatId = body.chat_id?.trim();
  if (!chatId) return NextResponse.json({ error: "chat_id required" }, { status: 400 });

  const service = createServiceClient();

  // Get current list
  const { data: cfg } = await service
    .from("wazzup_config")
    .select("allowed_chat_ids")
    .eq("company_id", companyId)
    .maybeSingle();

  const current: string[] = cfg?.allowed_chat_ids ?? [];
  if (current.includes(chatId)) return NextResponse.json({ allowed_chat_ids: current });

  const updated = [...current, chatId];
  await service.from("wazzup_config")
    .upsert({ company_id: companyId, allowed_chat_ids: updated }, { onConflict: "company_id" });

  return NextResponse.json({ allowed_chat_ids: updated });
}

// DELETE — remove a chatId
export async function DELETE(request: NextRequest) {
  const companyId = await getCompany();
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({})) as { chat_id?: string };
  const chatId = body.chat_id?.trim();
  if (!chatId) return NextResponse.json({ error: "chat_id required" }, { status: 400 });

  const service = createServiceClient();

  const { data: cfg } = await service
    .from("wazzup_config")
    .select("allowed_chat_ids")
    .eq("company_id", companyId)
    .maybeSingle();

  const updated = (cfg?.allowed_chat_ids ?? []).filter((id: string) => id !== chatId);
  await service.from("wazzup_config")
    .upsert({ company_id: companyId, allowed_chat_ids: updated }, { onConflict: "company_id" });

  return NextResponse.json({ allowed_chat_ids: updated });
}
