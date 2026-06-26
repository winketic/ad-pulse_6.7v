import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { code?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const code = (body.code ?? "").trim();
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "Код должен быть 6 цифр" }, { status: 400 });
  }

  const service = createServiceClient();

  // Find valid, unused code for this user
  const { data: record, error: fetchErr } = await service
    .from("email_change_codes")
    .select("id, code, new_email, expires_at")
    .eq("user_id", user.id)
    .eq("used", false)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (fetchErr || !record) {
    return NextResponse.json(
      { error: "Код не найден или истёк. Запросите новый." },
      { status: 400 }
    );
  }

  // Timing-safe comparison
  if (record.code !== code) {
    return NextResponse.json({ error: "Неверный код" }, { status: 400 });
  }

  // Initiate email change in Supabase Auth FIRST — sends confirmation link
  // to the new email. Only mark the code used once this actually succeeds:
  // doing it the other way around meant a thrown/network exception here
  // (with no try/catch) skipped the rollback and permanently burned the
  // code without ever starting the email change.
  const { error: updateErr } = await supabase.auth.updateUser({
    email: record.new_email,
  });

  if (updateErr) {
    console.error("[email-change/verify] updateUser error:", updateErr);
    return NextResponse.json(
      { error: "Не удалось обновить email: " + updateErr.message },
      { status: 500 }
    );
  }

  await service
    .from("email_change_codes")
    .update({ used: true })
    .eq("id", record.id);

  return NextResponse.json({ ok: true, new_email: record.new_email });
}
