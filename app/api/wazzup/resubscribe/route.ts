import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { ensureFreshToken } from "@/lib/wazzup/refreshToken";
import { subscribeToWebhooks } from "@/lib/wazzup/subscribe";

export async function POST() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id, role")
    .eq("id", user.id)
    .single();

  if (!profile?.company_id || profile.role !== "admin") {
    return NextResponse.json({ error: "Только администратор" }, { status: 403 });
  }

  const companyId = profile.company_id as string;

  try {
    const accessToken = await ensureFreshToken(companyId);
    await subscribeToWebhooks(companyId, accessToken);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[wazzup/resubscribe] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
