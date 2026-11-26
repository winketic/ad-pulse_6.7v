import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { getBillingOverview } from "@/lib/billing/data";
import { billingReadOnly } from "@/lib/billing/plans";
import { isFreedomPayConfigured } from "@/lib/billing/freedompay";
import BillingClient from "./BillingClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ paid?: string; failed?: string }>;
}) {
  const sp = await searchParams;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id, role")
    .eq("id", user.id)
    .single();

  if (!profile?.company_id) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <h1 className="text-display text-[var(--text)]">Оплата</h1>
        <p className="text-sm text-[var(--muted)] mt-2">Компания ещё не создана — завершите регистрацию.</p>
      </div>
    );
  }

  const overview = await getBillingOverview(profile.company_id);
  const readOnly = billingReadOnly(overview.subscription);

  return (
    <BillingClient
      subscription={overview.subscription}
      offers={overview.offers}
      invoices={overview.invoices}
      canManage={profile.role === "admin"}
      providerReady={isFreedomPayConfigured()}
      readOnly={readOnly}
      email={user.email ?? null}
      notice={sp.paid ? "paid" : sp.failed ? "failed" : null}
    />
  );
}
