"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const ADMIN_EMAIL = "altai.dx@gmail.com";

async function requireAdmin() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) throw new Error("Доступ запрещён");
  return user;
}

export async function approveRegistration(id: string) {
  await requireAdmin();
  const service = createServiceClient();

  // Load registration
  const { data: reg, error: regErr } = await service
    .from("registrations")
    .select("*")
    .eq("id", id)
    .single();

  if (regErr || !reg) throw new Error("Заявка не найдена");
  if (reg.status !== "pending") throw new Error("Заявка уже обработана");

  // 1. Create company
  const { data: company, error: companyErr } = await service
    .from("companies")
    .insert({ name: reg.company_name })
    .select("id")
    .single();

  if (companyErr || !company) throw new Error(`Ошибка создания компании: ${companyErr?.message}`);

  // 2. Invite user
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://ad-pulse-eight.vercel.app").replace(/\/$/, "");

  const { data: invited, error: inviteErr } = await service.auth.admin.inviteUserByEmail(
    reg.email,
    { redirectTo: `${appUrl}/invite` }
  );

  let userId: string;

  if (inviteErr) {
    const alreadyExists =
      inviteErr.message.toLowerCase().includes("already registered") ||
      inviteErr.message.toLowerCase().includes("already in use") ||
      inviteErr.status === 422;

    if (!alreadyExists) {
      // Rollback company
      await service.from("companies").delete().eq("id", company.id);
      throw new Error(`Ошибка приглашения: ${inviteErr.message}`);
    }

    const { data: authList } = await service.auth.admin.listUsers({ perPage: 1000 });
    const found = (authList?.users ?? []).find((u) => u.email?.toLowerCase() === reg.email);
    if (!found) {
      await service.from("companies").delete().eq("id", company.id);
      throw new Error("Пользователь не найден после приглашения");
    }
    userId = found.id;
  } else {
    userId = invited.user.id;
  }

  // 3. Create profile with company_id and admin role
  const { error: profileErr } = await service
    .from("profiles")
    .upsert(
      {
        id: userId,
        company_id: company.id,
        role: "admin",
        full_name: reg.contact_name,
      },
      { onConflict: "id" }
    );

  if (profileErr) {
    await service.from("companies").delete().eq("id", company.id);
    throw new Error(`Ошибка создания профиля: ${profileErr.message}`);
  }

  // 4. Update registration status
  await service.from("registrations").update({ status: "approved" }).eq("id", id);

  revalidatePath("/admin/registrations");
}

export async function rejectRegistration(id: string) {
  await requireAdmin();
  const service = createServiceClient();

  const { error } = await service
    .from("registrations")
    .update({ status: "rejected" })
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/admin/registrations");
}
