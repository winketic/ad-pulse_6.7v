import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { Resend } from "resend";

const CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export async function POST(request: NextRequest) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { new_email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const newEmail = (body.new_email ?? "").trim().toLowerCase();
  if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    return NextResponse.json({ error: "Некорректный email" }, { status: 400 });
  }

  if (newEmail === user.email?.toLowerCase()) {
    return NextResponse.json({ error: "Это уже ваш текущий email" }, { status: 400 });
  }

  const service = createServiceClient();

  // Rate-limit: max 3 requests per user per 10 minutes. Counts ALL codes
  // created in the window — used or not — because the "invalidate previous
  // unused codes" step below would otherwise let a request loop bypass this
  // cap indefinitely (every new request frees up its own quota).
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count } = await service
    .from("email_change_codes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gt("created_at", tenMinutesAgo);

  if ((count ?? 0) >= 3) {
    return NextResponse.json(
      { error: "Слишком много попыток. Подождите 10 минут." },
      { status: 429 }
    );
  }

  // Invalidate any previous unused codes for this user
  await service
    .from("email_change_codes")
    .update({ used: true })
    .eq("user_id", user.id)
    .eq("used", false);

  // Generate 6-digit code
  const code = String(crypto.randomInt(100000, 999999));
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();

  const { error: insertErr } = await service.from("email_change_codes").insert({
    user_id: user.id,
    code,
    new_email: newEmail,
    expires_at: expiresAt,
  });

  if (insertErr) {
    console.error("[email-change/request] insert error:", insertErr);
    return NextResponse.json({ error: "Внутренняя ошибка" }, { status: 500 });
  }

  // Send code to current email
  const currentEmail = user.email ?? "";
  const { error: emailErr } = await resend.emails.send({
    from: process.env.EMAIL_FROM ?? "onboarding@resend.dev",
    to: currentEmail,
    subject: "Подтверждение смены email — AD Pulse",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #0a0a0a;">Смена email</h2>
        <p>Вы запросили смену email на <strong>${newEmail}</strong>.</p>
        <p>Ваш код подтверждения:</p>
        <div style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #00f5c4; margin: 20px 0;">
          ${code}
        </div>
        <p style="color: #666; font-size: 13px;">Код действителен 15 минут. Если вы не запрашивали смену email — проигнорируйте это письмо.</p>
      </div>
    `,
  });

  if (emailErr) {
    console.error("[email-change/request] resend error:", emailErr);
    return NextResponse.json({ error: "Не удалось отправить письмо" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, masked: maskEmail(currentEmail) });
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  const visible = local.slice(0, 2);
  return `${visible}***@${domain}`;
}
