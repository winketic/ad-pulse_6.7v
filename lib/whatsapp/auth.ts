import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

/**
 * Компания текущего пользователя — только из сессии, никогда из body/query.
 * Все роуты подключения WhatsApp доступны лишь администратору компании.
 */
export async function getAdminCompany(): Promise<string | null> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id, role")
    .eq("id", user.id)
    .single();

  if (!profile?.company_id || profile.role !== "admin") return null;
  return profile.company_id as string;
}
