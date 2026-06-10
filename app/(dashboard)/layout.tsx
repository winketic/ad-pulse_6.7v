import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import DashboardShell from "@/components/layout/DashboardShell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, company_id, avatar_url, role")
    .eq("id", user.id)
    .single();

  // Redirect invited users who haven't completed onboarding yet
  // (their full_name defaults to their email address)
  if (profile && (!profile.full_name || profile.full_name === user.email)) {
    redirect("/onboarding");
  }

  // Redirect admins who haven't completed company setup
  if (profile?.role === "admin" && profile?.company_id) {
    const { data: company } = await supabase
      .from("companies")
      .select("setup_completed")
      .eq("id", profile.company_id)
      .single();
    if (company && !company.setup_completed) {
      redirect("/onboarding/setup");
    }
  }

  const displayName = profile?.full_name || user.email || "Пользователь";

  // Count WhatsApp messages awaiting manual confirmation
  let whatsappBadge = 0;
  if (profile?.company_id) {
    try {
      const { count } = await supabase
        .from("wazzup_messages")
        .select("*", { count: "exact", head: true })
        .eq("company_id", profile.company_id)
        .eq("parsed", true)
        .eq("needs_review", true);
      whatsappBadge = count ?? 0;
    } catch {
      whatsappBadge = 0;
    }
  }

  return (
    <DashboardShell
      userName={displayName}
      whatsappBadge={whatsappBadge}
      avatarUrl={profile?.avatar_url ?? null}
    >
      {children}
    </DashboardShell>
  );
}
