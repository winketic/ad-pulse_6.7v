import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import AdminRegistrationsClient from "./AdminRegistrationsClient";

export const dynamic = "force-dynamic";

const ADMIN_EMAIL = "altai.dx@gmail.com";

export default async function AdminRegistrationsPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.email !== ADMIN_EMAIL) notFound();

  const service = createServiceClient();
  const { data: registrations } = await service
    .from("registrations")
    .select("*")
    .order("created_at", { ascending: false });

  return <AdminRegistrationsClient registrations={registrations ?? []} />;
}
