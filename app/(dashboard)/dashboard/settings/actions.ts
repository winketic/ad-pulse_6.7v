"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

// ─── Helpers ──────────────────────────────────────────────

async function getAdminContext() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Не авторизован");

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id, role")
    .eq("id", user.id)
    .single();

  if (!profile?.company_id) throw new Error("Компания не найдена");

  return {
    supabase,
    userId: user.id,
    companyId: profile.company_id as string,
    role: profile.role as string,
  };
}

// ─── Wazzup ───────────────────────────────────────────────

export async function saveWazzupConfig(
  partnerEmail: string,
  partnerPassword: string,
  clientId: string
) {
  const clean = (s: string) => s.replace(/\uFEFF/g, "").trim();
  const trimEmail = clean(partnerEmail);
  const trimPass = clean(partnerPassword);
  const trimClientId = clean(clientId);

  if (!trimEmail || !trimPass) throw new Error("Email и пароль обязательны");
  if (!trimClientId) throw new Error("Client ID обязателен");

  const { companyId, role } = await getAdminContext();
  if (role !== "admin") throw new Error("Только администратор может настраивать интеграцию");

  const service = createServiceClient();
  const { error } = await service
    .from("wazzup_config")
    .upsert(
      {
        company_id: companyId,
        partner_email: trimEmail,
        partner_password: trimPass,
        client_id: trimClientId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id" }
    );

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/settings");
}

export async function disconnectWazzup() {
  const { companyId } = await getAdminContext();
  const service = createServiceClient();

  const { error } = await service
    .from("wazzup_tokens")
    .delete()
    .eq("company_id", companyId);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/settings");
}

// ─── Company ──────────────────────────────────────────────

export async function updateCompanyName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Название не может быть пустым");

  const { companyId, role } = await getAdminContext();
  if (role !== "admin" && role !== "manager")
    throw new Error("Нет прав для изменения названия компании");

  const service = createServiceClient();
  const { error } = await service
    .from("companies")
    .update({ name: trimmed })
    .eq("id", companyId);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/settings");
}

// ─── Users ────────────────────────────────────────────────

export type UserRow = {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
};

export async function listCompanyUsers(): Promise<UserRow[]> {
  const { companyId } = await getAdminContext();
  const service = createServiceClient();

  const { data: profiles, error: profilesError } = await service
    .from("profiles")
    .select("id, full_name, role")
    .eq("company_id", companyId);

  if (profilesError) throw new Error(profilesError.message);
  if (!profiles?.length) return [];

  // Fetch emails from auth.users via service role admin API
  let emailMap = new Map<string, string>();
  try {
    const { data: authUsers } = await service.auth.admin.listUsers({ perPage: 1000 });
    emailMap = new Map((authUsers?.users ?? []).map((u) => [u.id, u.email ?? ""]));
  } catch {
    // Non-critical — show users without emails rather than crashing
  }

  return profiles.map((p) => ({
    id: p.id,
    full_name: p.full_name ?? null,
    email: emailMap.get(p.id) ?? "—",
    role: p.role ?? "warehouse",
  }));
}

export async function updateUserRole(userId: string, role: string) {
  const { companyId, role: myRole, userId: myId } = await getAdminContext();
  if (myRole !== "admin") throw new Error("Только администратор может менять роли");
  if (userId === myId) throw new Error("Нельзя изменить собственную роль");

  const service = createServiceClient();

  // Verify user belongs to company
  const { data: p } = await service
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .eq("company_id", companyId)
    .single();
  if (!p) throw new Error("Пользователь не найден");

  const { error } = await service
    .from("profiles")
    .update({ role })
    .eq("id", userId);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/settings");
}

export async function removeUserFromCompany(userId: string) {
  const { companyId, role: myRole, userId: myId } = await getAdminContext();
  if (myRole !== "admin") throw new Error("Только администратор может удалять пользователей");
  if (userId === myId) throw new Error("Нельзя удалить себя");

  const service = createServiceClient();

  const { data: p } = await service
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .eq("company_id", companyId)
    .single();
  if (!p) throw new Error("Пользователь не найден");

  // Delete profile (company_id is NOT NULL, can't set to null)
  // Deleting the profile removes the user from this company
  // without touching their auth.users record
  const { error } = await service
    .from("profiles")
    .delete()
    .eq("id", userId)
    .eq("company_id", companyId);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/settings");
}

export async function inviteUserByEmail(email: string, role: string) {
  const { companyId, role: myRole } = await getAdminContext();
  if (myRole !== "admin") throw new Error("Только администратор может добавлять пользователей");

  const service = createServiceClient();
  const cleanEmail = email.trim().toLowerCase();

  let userId: string;

  // Try to invite — creates user and sends email link pointing to /invite
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://ad-pulse-eight.vercel.app").replace(/\/$/, "");
  const { data: inviteData, error: inviteError } = await service.auth.admin.inviteUserByEmail(cleanEmail, {
    redirectTo: `${appUrl}/invite`,
  });

  if (inviteError) {
    // User already registered — find them by email instead
    const alreadyExists =
      inviteError.message.toLowerCase().includes("already registered") ||
      inviteError.message.toLowerCase().includes("already in use") ||
      inviteError.message.toLowerCase().includes("already exists") ||
      inviteError.status === 422;

    if (!alreadyExists) {
      throw new Error(`Ошибка приглашения: ${inviteError.message}`);
    }

    const { data: authList } = await service.auth.admin.listUsers({ perPage: 1000 });
    const found = (authList?.users ?? []).find(
      (u) => u.email?.toLowerCase() === cleanEmail
    );
    if (!found) throw new Error("Пользователь не найден. Попробуйте ещё раз.");
    userId = found.id;
  } else {
    userId = inviteData.user.id;
  }

  // Guard: don't steal from another company
  const { data: existingProfile } = await service
    .from("profiles")
    .select("company_id")
    .eq("id", userId)
    .maybeSingle();

  if (existingProfile?.company_id && existingProfile.company_id !== companyId) {
    throw new Error("Пользователь уже состоит в другой компании");
  }

  const { error: profileError } = await service
    .from("profiles")
    .upsert(
      { id: userId, company_id: companyId, role, full_name: cleanEmail },
      { onConflict: "id" }
    );

  if (profileError) throw new Error(profileError.message);
  revalidatePath("/dashboard/settings");
}
