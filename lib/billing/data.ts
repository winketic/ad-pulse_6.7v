// Чтение биллинга на сервере. Все запросы идут через service-role: тарифы
// и подписки не должны зависеть от RLS-настроек клиента, а счета видит только
// владелец кабинета.

import { createServiceClient } from "@/lib/supabase/service";
import type { InvoiceRow } from "@/lib/billing/invoices";
import type { PlanOffer, SubscriptionRow } from "@/lib/billing/plans";

export type BillingOverview = {
  offers: PlanOffer[];
  subscription: SubscriptionRow | null;
  invoices: InvoiceRow[];
};

/** Таблица ещё не создана (миграция 059 не применена) или схема не обновилась. */
function isSchemaMissing(message: string): boolean {
  return /relation .* does not exist|Could not find the table|schema cache|PGRST205|42P01/i.test(message);
}

export async function getPlanOffers(): Promise<PlanOffer[]> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("plan_offers")
    .select("code, name, monthly_price, wa_numbers, wa_addon_price, summary, sort_order")
    .order("sort_order", { ascending: true });
  if (error) {
    if (isSchemaMissing(error.message)) return [];
    throw new Error(`Не удалось загрузить тарифы: ${error.message}`);
  }
  return (data ?? []) as PlanOffer[];
}

export async function getSubscription(companyId: string): Promise<SubscriptionRow | null> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("subscriptions")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) {
    if (isSchemaMissing(error.message)) return null;
    throw new Error(`Не удалось загрузить подписку: ${error.message}`);
  }
  return (data as SubscriptionRow | null) ?? null;
}

export async function getInvoices(companyId: string, limit = 12): Promise<InvoiceRow[]> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("billing_invoices")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (isSchemaMissing(error.message)) return [];
    throw new Error(`Не удалось загрузить счета: ${error.message}`);
  }
  return (data ?? []) as InvoiceRow[];
}

export async function getBillingOverview(companyId: string): Promise<BillingOverview> {
  const [offers, subscription, invoices] = await Promise.all([
    getPlanOffers(),
    getSubscription(companyId),
    getInvoices(companyId),
  ]);
  return { offers, subscription, invoices };
}
