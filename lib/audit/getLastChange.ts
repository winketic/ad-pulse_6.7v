"use server";

import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

export type AuditedTable = "production_plans" | "materials" | "material_transactions";

export type LastChange = {
  changedByName: string;
  changedAt: string;
  action: "insert" | "update" | "delete";
};

// record_id must come from data already scoped to the caller's company
// (e.g. a row from a prior company-filtered query) — audit_log RLS
// additionally blocks cross-tenant reads even if it weren't.
export async function getLastChange(
  tableName: AuditedTable,
  recordId: string
): Promise<LastChange | null> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data } = await supabase
    .from("audit_log")
    .select("changed_at, action, profiles(full_name)")
    .eq("table_name", tableName)
    .eq("record_id", recordId)
    .order("changed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  const profile = data.profiles as unknown as { full_name: string } | null;

  return {
    changedByName: profile?.full_name ?? "Система",
    changedAt: data.changed_at,
    action: data.action as "insert" | "update" | "delete",
  };
}
