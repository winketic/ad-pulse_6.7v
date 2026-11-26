import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isPlatformOwnerEmail } from "@/lib/auth/platform-owner";
import AdminBillingClient from "./AdminBillingClient";
import { checkEmailStatus } from "@/lib/email";

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
  const emailStatus = await checkEmailStatus();
  const freedomPay = {
    configured: Boolean(process.env.FREEDOMPAY_MERCHANT_ID && process.env.FREEDOMPAY_SECRET_KEY),
    test: process.env.FREEDOMPAY_TEST_MODE === "1",
  };

  return (
    <div className="min-h-screen p-4 sm:p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-[var(--text)]">Биллинг платформы</h1>
        <Link href="/admin/platform" className="text-sm text-[var(--muted)] hover:text-[var(--text)]">
          ← Компании
        </Link>
      </div>

      <div
        className="rounded-xl px-4 py-3 text-sm"
        style={{
          background: emailStatus.ok ? "color-mix(in srgb, #059669 10%, transparent)" : "color-mix(in srgb, #dc2626 10%, transparent)",
          border: `1px solid ${emailStatus.ok ? "color-mix(in srgb, #059669 30%, transparent)" : "color-mix(in srgb, #dc2626 30%, transparent)"}`,
        }}
      >
        <b>Почта:</b> {emailStatus.ok ? "Resend принимает ключ" : emailStatus.message}
        <span className="text-[var(--muted)]"> · отправитель: {emailStatus.from}</span>
        {!emailStatus.ok && (
          <span className="block text-xs text-[var(--muted)] mt-1">
            Пока ключ не работает, коды регистрации, счета и обращения не уходят. Обновите RESEND_API_KEY в Vercel.
          </span>
        )}
      </div>

      <div
        className="rounded-xl px-4 py-3 text-sm"
        style={{
          background: freedomPay.configured ? "color-mix(in srgb, #059669 10%, transparent)" : "color-mix(in srgb, #dc2626 10%, transparent)",
          border: `1px solid ${freedomPay.configured ? "color-mix(in srgb, #059669 30%, transparent)" : "color-mix(in srgb, #dc2626 30%, transparent)"}`,
        }}
      >
        <b>Freedom Pay:</b>{" "}
        {freedomPay.configured
          ? `ключи заданы${freedomPay.test ? ", тестовый режим" : ", рабочий режим"}`
          : "ключей нет, онлайн-оплата выключена"}
        {!freedomPay.configured && (
          <span className="block text-xs text-[var(--muted)] mt-1">
            Нужны FREEDOMPAY_MERCHANT_ID и FREEDOMPAY_SECRET_KEY из кабинета мерчанта. До этого счета оплачиваются переводом.
          </span>
        )}
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
