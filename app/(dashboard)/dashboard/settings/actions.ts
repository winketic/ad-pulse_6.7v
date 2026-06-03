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

  const { data: profiles } = await service
    .from("profiles")
    .select("id, full_name, role")
    .eq("company_id", companyId);

  if (!profiles?.length) return [];

  // Fetch emails from auth.users via admin API
  const { data: authUsers } = await service.auth.admin.listUsers();
  const emailMap = new Map(
    (authUsers?.users ?? []).map((u) => [u.id, u.email ?? ""])
  );

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

  const { error } = await service
    .from("profiles")
    .update({ company_id: null })
    .eq("id", userId);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/settings");
}

export async function inviteUserByEmail(email: string, role: string) {
  const { companyId, role: myRole } = await getAdminContext();
  if (myRole !== "admin") throw new Error("Только администратор может добавлять пользователей");

  const service = createServiceClient();

  // Find user in auth by email
  const { data: authList } = await service.auth.admin.listUsers();
  const authUser = (authList?.users ?? []).find(
    (u) => u.email?.toLowerCase() === email.trim().toLowerCase()
  );

  if (!authUser) {
    throw new Error(
      "Пользователь с таким email не зарегистрирован. Сначала попросите его войти в систему."
    );
  }

  // Check if user already has a company
  const { data: existing } = await service
    .from("profiles")
    .select("company_id")
    .eq("id", authUser.id)
    .single();

  if (existing?.company_id && existing.company_id !== companyId) {
    throw new Error("Пользователь уже состоит в другой компании");
  }

  const { error } = await service
    .from("profiles")
    .upsert(
      { id: authUser.id, company_id: companyId, role },
      { onConflict: "id" }
    );

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/settings");
}
