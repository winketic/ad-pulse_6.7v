"use server";

import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { getPlanOffers, getSubscription } from "@/lib/billing/data";
import {
  amountForPlan,
  isPurchasablePlan,
  type BillingPeriod,
  type PlanCode,
} from "@/lib/billing/plans";
import {
  attachPaymentLink,
  createInvoice,
  getInvoice,
  logBillingEvent,
} from "@/lib/billing/invoices";
import { sendInvoiceEmail } from "@/lib/billing/emails";

async function requireCompanyAdmin() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) throw new Error("Сессия истекла — войдите заново");

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id, role")
    .eq("id", user.id)
    .single();

  if (!profile?.company_id) throw new Error("Компания не найдена");
  if (profile.role !== "admin") throw new Error("Счёт может выставить только администратор компании");

  return { email: user.email, companyId: profile.company_id as string };
}

export type InvoiceActionResult = {
  invoiceId: string;
  number: string;
  amount: number;
  paymentUrl: string | null;
  emailSent: boolean;
};

/** Выставляет счёт на выбранный тариф: письмо + ссылка на оплату, если эквайринг настроен. */
export async function createInvoiceAction(input: {
  planCode: string;
  period: BillingPeriod;
  waAddon: boolean;
}): Promise<InvoiceActionResult> {
  const { email, companyId } = await requireCompanyAdmin();

  const planCode = input?.planCode as PlanCode;
  const period: BillingPeriod = input?.period === "yearly" ? "yearly" : "monthly";
  const waAddon = Boolean(input?.waAddon);

  if (!isPurchasablePlan(planCode)) throw new Error("Пилот не продаётся — выберите тариф");

  const offers = await getPlanOffers();
  const offer = offers.find((item) => item.code === planCode);
  if (!offer) throw new Error("Тариф не найден");

  if (waAddon && offer.wa_addon_price <= 0) {
    throw new Error("Для этого тарифа WhatsApp уже включён");
  }

  const subscription = await getSubscription(companyId);
  if (subscription?.status === "active" && subscription.plan_code === planCode && subscription.billing_period === period) {
    throw new Error("Этот тариф уже оплачен — продление доступно после окончания периода");
  }

  const amount = amountForPlan(offer, period, waAddon);
  const invoice = await createInvoice({ companyId, offer, period, waAddon, amount });

  let paymentUrl: string | null = null;
  try {
    paymentUrl = await attachPaymentLink(invoice, email);
  } catch (providerError) {
    console.error("[billing] payment page failed:", providerError);
  }

  let emailSent = false;
  try {
    await sendInvoiceEmail({ to: email, invoice: { ...invoice, payment_url: paymentUrl }, offer });
    emailSent = true;
  } catch (emailError) {
    console.error("[billing] invoice email failed:", emailError);
  }

  await logBillingEvent({
    companyId,
    invoiceId: invoice.id,
    type: "invoice_created",
    payload: { number: invoice.number, amount, provider: paymentUrl ? "freedompay" : "manual", emailSent },
  });

  return { invoiceId: invoice.id, number: invoice.number, amount, paymentUrl, emailSent };
}

/** Повторно запрашивает ссылку на оплату для существующего счёта. */
export async function payInvoiceAction(invoiceId: string): Promise<{ paymentUrl: string | null }> {
  const { email, companyId } = await requireCompanyAdmin();
  if (typeof invoiceId !== "string" || !/^[0-9a-f-]{36}$/i.test(invoiceId)) throw new Error("Некорректный счёт");

  const invoice = await getInvoice(invoiceId);
  if (!invoice || invoice.company_id !== companyId) throw new Error("Счёт не найден");
  if (invoice.status !== "pending") throw new Error("Счёт уже закрыт");

  const paymentUrl = await attachPaymentLink(invoice, email);
  if (!paymentUrl) {
    throw new Error("Онлайн-оплата пока не подключена. Счёт выставлен — оплатите по реквизитам из письма.");
  }

  await logBillingEvent({
    companyId,
    invoiceId,
    type: "payment_link_opened",
    payload: { number: invoice.number },
  });

  return { paymentUrl };
}
