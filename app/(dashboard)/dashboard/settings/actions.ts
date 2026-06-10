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

// ─── Profile ──────────────────────────────────────────────

export async function updateMyProfile(fullName: string, position: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Не авторизован");

  const trimmedName = fullName.trim();
  if (!trimmedName) throw new Error("Имя не может быть пустым");

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: trimmedName, position: position.trim() || null })
    .eq("id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/settings");
}

export async function saveAvatarUrl(avatarUrl: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Не авторизован");
  await supabase.from("profiles").update({ avatar_url: avatarUrl }).eq("id", user.id);
  revalidatePath("/dashboard/settings");
}

export async function saveBannerColor(bannerColor: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Не авторизован");
  await supabase.from("profiles").update({ banner_color: bannerColor }).eq("id", user.id);
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
  position: string | null;
  avatar_url: string | null;
  banner_color: string | null;
};

export async function listCompanyUsers(): Promise<UserRow[]> {
  try {
    const { companyId } = await getAdminContext();
    const service = createServiceClient();

    const { data: profiles, error: profilesError } = await service
      .from("profiles")
      .select("id, full_name, role, position, avatar_url, banner_color")
      .eq("company_id", companyId);

    if (profilesError) {
      console.error("[listCompanyUsers] profiles error:", profilesError.message);
      return [];
    }
    if (!profiles?.length) return [];

    // Fetch emails from auth.users via service role admin API
    let emailMap = new Map<string, string>();
    try {
      const { data: authUsers } = await service.auth.admin.listUsers({ perPage: 1000 });
      emailMap = new Map((authUsers?.users ?? []).map((u) => [u.id, u.email ?? ""]));
    } catch (e) {
      console.error("[listCompanyUsers] auth.admin.listUsers error:", e);
    }

    return profiles.map((p) => ({
      id: p.id,
      full_name: p.full_name ?? null,
      email: emailMap.get(p.id) ?? "—",
      role: p.role ?? "warehouse",
      position: p.position ?? null,
      avatar_url: p.avatar_url ?? null,
      banner_color: p.banner_color ?? null,
    }));
  } catch (e) {
    console.error("[listCompanyUsers] unexpected error:", e);
    return [];
  }
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

  // 1. Delete profile first (FK constraint requires this order)
  const { error: profileError } = await service
    .from("profiles")
    .delete()
    .eq("id", userId)
    .eq("company_id", companyId);

  if (profileError) throw new Error(profileError.message);

  // 2. Delete from Supabase Auth so the user cannot log in again
  const { error: authError } = await service.auth.admin.deleteUser(userId);
  if (authError) {
    console.error("[removeUser] auth.admin.deleteUser failed:", authError.message);
    // Non-fatal: profile is gone, access is blocked even if auth deletion fails
  }

  revalidatePath("/dashboard/settings");
}

export async function inviteUserByEmail(
  email: string,
  role: string
): Promise<{ ok: true; emailSent: boolean } | { error: string }> {
  try {
    const { companyId, role: myRole } = await getAdminContext();
    if (myRole !== "admin") return { error: "Только администратор может добавлять пользователей" };

    const service = createServiceClient();
    const cleanEmail = email.trim().toLowerCase();
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://ad-pulse-eight.vercel.app").replace(/\/$/, "");

    // Invite user via Supabase mailer
    const { data: inviteData, error: inviteError } = await service.auth.admin.inviteUserByEmail(
      cleanEmail,
      { redirectTo: `${appUrl}/auth/confirm?next=/invite` }
    );

    let userId: string;

    if (inviteError) {
      const alreadyExists =
        inviteError.message.toLowerCase().includes("already registered") ||
        inviteError.message.toLowerCase().includes("already in use") ||
        inviteError.message.toLowerCase().includes("already exists") ||
        inviteError.status === 422;

      if (!alreadyExists) {
        return { error: `Ошибка приглашения: ${inviteError.message}` };
      }

      const { data: authList } = await service.auth.admin.listUsers({ perPage: 1000 });
      const found = (authList?.users ?? []).find((u) => u.email?.toLowerCase() === cleanEmail);
      if (!found) return { error: "Пользователь не найден. Попробуйте ещё раз." };
      userId = found.id;
    } else {
      if (!inviteData?.user) return { error: "Ошибка создания пользователя" };
      userId = inviteData.user.id;
    }

    // Guard: don't steal from another company
    const { data: existingProfile } = await service
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .maybeSingle();

    if (existingProfile?.company_id && existingProfile.company_id !== companyId) {
      return { error: "Пользователь уже состоит в другой компании" };
    }

    const { error: profileError } = await service.from("profiles").upsert(
      { id: userId, company_id: companyId, role, full_name: cleanEmail },
      { onConflict: "id" }
    );

    if (profileError) return { error: profileError.message };
    revalidatePath("/dashboard/settings");
    return { ok: true, emailSent: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Неизвестная ошибка" };
  }
}
