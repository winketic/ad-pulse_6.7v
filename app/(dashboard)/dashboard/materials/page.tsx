import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import MaterialsClient from "@/components/materials/MaterialsClient";
import type { Material } from "@/components/materials/MaterialsClient";
import NoCompanyState from "@/components/ui/NoCompanyState";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MaterialsPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", user.id)
    .single();

  const company_id = profile?.company_id as string | undefined;
  if (!company_id) return <NoCompanyState />;

  const { data } = await supabase
    .from("materials")
    .select("id, name, unit, gost_norm, created_at")
    .eq("company_id", company_id)
    .order("created_at", { ascending: false });

  return <MaterialsClient materials={(data as Material[]) ?? []} />;
}
