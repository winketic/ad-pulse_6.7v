import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const ADMIN_EMAIL = "altai.dx@gmail.com";

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) {
    return Response.json({ error: "Доступ запрещён" }, { status: 403 });
  }

  const { registrationId } = await request.json();
  const svc = createServiceClient();

  const { error } = await svc
    .from("registrations")
    .update({ status: "rejected" })
    .eq("id", registrationId);

  if (error) return Response.json({ error: error.message });
  return Response.json({ ok: true });
}
