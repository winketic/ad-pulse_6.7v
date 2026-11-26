"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isPlatformOwnerEmail } from "@/lib/auth/platform-owner";
import { getPlanOffers, getSubscription } from "@/lib/billing/data";
import { cancelInvoice, getInvoice, logBillingEvent, markInvoicePaid } from "@/lib/billing/invoices";
import { sendPaymentReceivedEmail } from "@/lib/billing/emails";

async function requireOwner() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isPlatformOwnerEmail(user.email)) throw new Error("Доступ запрещён");
}

export async function markInvoicePaidByAdmin(invoiceId: string): Promise<void> {
  await requireOwner();
  if (typeof invoiceId !== "string" || !/^[0-9a-f-]{36}$/i.test(invoiceId)) throw new Error("Некорректный счёт");

  const invoice = await getInvoice(invoiceId);
  if (!invoice) throw new Error("Счёт не найден");
  if (invoice.status === "paid") throw new Error("Счёт уже оплачен");

  const result = await markInvoicePaid(invoiceId, "manual", null);
  await logBillingEvent({
    companyId: invoice.company_id,
    invoiceId,
    type: "payment_marked_by_admin",
    payload: { number: invoice.number, alreadyPaid: result.alreadyPaid },
  });

  if (!result.alreadyPaid) {
    const subscription = await getSubscription(invoice.company_id);
    const offers = await getPlanOffers();
    const offer = offers.find((item) => item.code === invoice.plan_code);
    if (subscription?.billing_email && offer) {
      await sendPaymentReceivedEmail({
        to: subscription.billing_email,
        invoice,
        offer,
        periodEnd: result.periodEnd,
      }).catch((error) => console.error("[admin/billing] письмо об оплате:", error));
    }
  }

  revalidatePath("/admin/billing");
}

export async function cancelInvoiceByAdmin(invoiceId: string): Promise<void> {
  await requireOwner();
  if (typeof invoiceId !== "string" || !/^[0-9a-f-]{36}$/i.test(invoiceId)) throw new Error("Некорректный счёт");
  await cancelInvoice(invoiceId);
  revalidatePath("/admin/billing");
}

export async function grantTrialByAdmin(companyId: string, days = 30): Promise<void> {
  await requireOwner();
  if (typeof companyId !== "string" || !/^[0-9a-f-]{36}$/i.test(companyId)) throw new Error("Некорректная компания");
  const safeDays = Math.min(Math.max(Math.trunc(Number(days) || 30), 1), 180);

  const service = createServiceClient();
  const trialEnd = new Date(Date.now() + safeDays * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await service
    .from("subscriptions")
    .update({
      status: "trialing",
      plan_code: "trial",
      trial_ends_at: trialEnd,
      current_period_start: new Date().toISOString(),
      current_period_end: trialEnd,
      updated_at: new Date().toISOString(),
    })
    .eq("company_id", companyId);

  if (error) throw new Error(`Не удалось выдать пилот: ${error.message}`);
  await logBillingEvent({
    companyId,
    type: "trial_granted_by_admin",
    payload: { days: safeDays, trialEnd },
  });
  revalidatePath("/admin/billing");
}
