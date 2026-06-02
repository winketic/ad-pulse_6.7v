import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import MaterialsClient from "@/components/materials/MaterialsClient";
import type { Material } from "@/components/materials/MaterialsClient";

export default async function MaterialsPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let materials: Material[] = [];

  if (user) {
    const { data } = await supabase
      .from("materials")
      .select("id, name, unit, gost_norm, created_at")
      .order("created_at", { ascending: false });

    materials = (data as Material[]) ?? [];
  }

  return <MaterialsClient materials={materials} />;
}
