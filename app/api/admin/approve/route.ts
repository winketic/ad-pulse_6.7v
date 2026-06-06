import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendTelegramMessage } from "@/lib/telegram/send";

const ADMIN_EMAIL = "altai.dx@gmail.com";
const ADMIN_CHAT_ID = "1700146125";
const APP_URL = "https://ad-pulse-eight.vercel.app";

export async function POST(request: NextRequest) {
  // Auth check — only admin
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) {
    return Response.json({ error: "Доступ запрещён" }, { status: 403 });
  }

  const { registrationId } = await request.json();
  const svc = createServiceClient();

  const { data: reg } = await svc
    .from("registrations")
    .select("*")
    .eq("id", registrationId)
    .single();

  if (!reg) return Response.json({ error: "Заявка не найдена" });
  if (reg.status !== "pending") return Response.json({ error: "Заявка уже обработана" });

  // 1. Create company
  const { data: company, error: companyErr } = await svc
    .from("companies")
    .insert({ name: reg.company_name })
    .select("id")
    .single();

  if (companyErr || !company) {
    return Response.json({ error: `Ошибка создания компании: ${companyErr?.message}` });
  }

  // 2. Invite user
  const { data: invited, error: inviteErr } = await svc.auth.admin.inviteUserByEmail(
    reg.email,
    { redirectTo: `${APP_URL}/invite` }
  );

  let userId: string;

  if (inviteErr) {
    const alreadyExists =
      inviteErr.message.toLowerCase().includes("already registered") ||
      inviteErr.message.toLowerCase().includes("already in use") ||
      inviteErr.status === 422;

    if (!alreadyExists) {
      await svc.from("companies").delete().eq("id", company.id);
      return Response.json({ error: `Ошибка приглашения: ${inviteErr.message}` });
    }

    const { data: authList } = await svc.auth.admin.listUsers({ perPage: 1000 });
    const found = (authList?.users ?? []).find((u) => u.email?.toLowerCase() === reg.email);
    if (!found) {
      await svc.from("companies").delete().eq("id", company.id);
      return Response.json({ error: "Пользователь не найден" });
    }
    userId = found.id;
  } else {
    userId = invited.user.id;
  }

  // 3. Create admin profile
  await svc.from("profiles").upsert(
    { id: userId, company_id: company.id, role: "admin", full_name: reg.contact_name },
    { onConflict: "id" }
  );

  // 4. Update status
  await svc.from("registrations").update({ status: "approved" }).eq("id", registrationId);

  // 5. Telegram notification
  await sendTelegramMessage(
    ADMIN_CHAT_ID,
    `✅ Заявка одобрена!\n🏢 ${reg.company_name}\n📧 ${reg.email}\n\n` +
      `<a href="${APP_URL}/admin/registrations">👉 Открыть заявки</a>`
  );

  return Response.json({ ok: true });
}
