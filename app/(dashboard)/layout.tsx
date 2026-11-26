import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import DashboardShell from "@/components/layout/DashboardShell";
import { isPlatformOwnerEmail } from "@/lib/auth/platform-owner";
import { billingReadOnly } from "@/lib/billing/plans";

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
  const isPlatformOwner = isPlatformOwnerEmail(user.email);

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, company_id, avatar_url, role")
    .eq("id", user.id)
    .single();

  // Профиля ещё нет: человек подтвердил почту, но компания не создана.
  if (!profile) {
    redirect("/welcome");
  }

  // Redirect invited users who haven't completed onboarding yet
  // (their full_name defaults to their email address)
  if (!isPlatformOwner && profile && (!profile.full_name || profile.full_name === user.email)) {
    redirect("/onboarding");
  }

  // Redirect admins who haven't completed company setup
  if (!isPlatformOwner && profile?.role === "admin" && profile?.company_id) {
    const { data: company } = await supabase
      .from("companies")
      .select("setup_completed")
      .eq("id", profile.company_id)
      .single();
    if (company && !company.setup_completed) {
      redirect("/onboarding/setup");
    }
  }

  // Просрочка больше 7 дней: ввод блокируется на уровне БД, интерфейс
  // показывает причину и ссылку на оплату.
  let readOnly = false;
  if (profile?.company_id) {
    try {
      const { data: subscription } = await supabase
        .from("subscriptions")
        .select("status, current_period_end, trial_ends_at")
        .eq("company_id", profile.company_id)
        .maybeSingle();
      readOnly = billingReadOnly(subscription);
    } catch {
      readOnly = false;
    }
  }

  const displayName = profile?.full_name || user.email || "Пользователь";

  // Count WhatsApp messages awaiting manual confirmation
  let whatsappBadge = 0;
  if (profile?.company_id) {
    try {
      const { count } = await supabase
        .from("whatsapp_messages")
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
      role={profile?.role ?? "warehouse"}
      isPlatformOwner={isPlatformOwner}
      billingReadOnly={readOnly}
    >
      {children}
    </DashboardShell>
  );
}
