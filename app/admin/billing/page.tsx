import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isPlatformOwnerEmail } from "@/lib/auth/platform-owner";
import AdminBillingClient from "./AdminBillingClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminBillingPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isPlatformOwnerEmail(user.email)) notFound();

  const service = createServiceClient();
  const [invoicesResult, subscriptionsResult, companiesResult] = await Promise.all([
    service.from("billing_invoices").select("*").order("created_at", { ascending: false }).limit(100),
    service.from("subscriptions").select("*").order("created_at", { ascending: false }),
    service.from("companies").select("id, name"),
  ]);

  if (invoicesResult.error) throw new Error(`Не удалось загрузить счета: ${invoicesResult.error.message}`);
  if (subscriptionsResult.error) throw new Error(`Не удалось загрузить подписки: ${subscriptionsResult.error.message}`);

  const companyNames = new Map((companiesResult.data ?? []).map((row) => [row.id, row.name]));

  return (
    <div className="min-h-screen p-4 sm:p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-[var(--text)]">Биллинг платформы</h1>
        <Link href="/admin/platform" className="text-sm text-[var(--muted)] hover:text-[var(--text)]">
          ← Компании
        </Link>
      </div>

      <AdminBillingClient
        invoices={(invoicesResult.data ?? []).map((row) => ({
          ...row,
          company_name: companyNames.get(row.company_id) ?? row.company_id,
        }))}
        subscriptions={(subscriptionsResult.data ?? []).map((row) => ({
          ...row,
          company_name: companyNames.get(row.company_id) ?? row.company_id,
        }))}
      />
    </div>
  );
}
