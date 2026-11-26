// Счета и оплата. Один счёт = один период тарифа. Статусы:
// pending → paid (после вебхука эквайринга или отметки админа)
// pending → canceled / expired.

import { randomBytes } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { isFreedomPayConfigured, createPaymentPage } from "@/lib/billing/freedompay";
import type { BillingPeriod, PlanCode, PlanOffer } from "@/lib/billing/plans";

export type InvoiceStatus = "pending" | "paid" | "canceled" | "expired";

export type InvoiceRow = {
  id: string;
  company_id: string;
  number: string;
  plan_code: PlanCode;
  billing_period: BillingPeriod;
  wa_addon: boolean;
  amount: number;
  currency: string;
  status: InvoiceStatus;
  period_start: string | null;
  period_end: string | null;
  due_at: string | null;
  paid_at: string | null;
  provider: string;
  provider_payment_id: string | null;
  payment_url: string | null;
  created_at: string;
};

const PAYMENT_DUE_DAYS = 7;

export function makeInvoiceNumber(now: Date = new Date()): string {
  const stamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  return `ADP-${stamp}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

export async function createInvoice(params: {
  companyId: string;
  offer: PlanOffer;
  period: BillingPeriod;
  waAddon: boolean;
  amount: number;
}): Promise<InvoiceRow> {
  const service = createServiceClient();
  const dueAt = new Date(Date.now() + PAYMENT_DUE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await service
    .from("billing_invoices")
    .insert({
      company_id: params.companyId,
      number: makeInvoiceNumber(),
      plan_code: params.offer.code,
      billing_period: params.period,
      wa_addon: params.waAddon,
      amount: params.amount,
      currency: "KZT",
      status: "pending",
      due_at: dueAt,
    })
    .select("*")
    .single();

  if (error || !data) throw new Error(`Не удалось выставить счёт: ${error?.message ?? "нет ответа"}`);
  return data as InvoiceRow;
}

export async function getInvoice(invoiceId: string): Promise<InvoiceRow | null> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("billing_invoices")
    .select("*")
    .eq("id", invoiceId)
    .maybeSingle();
  if (error) throw new Error(`Не удалось загрузить счёт: ${error.message}`);
  return (data as InvoiceRow | null) ?? null;
}

export type PaidInvoiceResult = {
  companyId: string;
  alreadyPaid: boolean;
  amount: number;
  planCode: string;
  periodEnd: string | null;
};

/** Идемпотентно: повторный вебхук или повторная отметка не продлевают период дважды. */
export async function markInvoicePaid(
  invoiceId: string,
  provider: string,
  paymentId: string | null,
): Promise<PaidInvoiceResult> {
  const service = createServiceClient();
  const { data, error } = await service.rpc("billing_mark_invoice_paid", {
    p_invoice_id: invoiceId,
    p_provider: provider,
    p_payment_id: paymentId,
  });
  if (error) throw new Error(`Не удалось отметить счёт оплаченным: ${error.message}`);

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("Счёт не найден");

  return {
    companyId: row.billing_company_id,
    alreadyPaid: Boolean(row.already_paid),
    amount: row.billing_amount,
    planCode: row.billing_plan_code,
    periodEnd: row.billing_period_end,
  };
}

export async function cancelInvoice(invoiceId: string): Promise<void> {
  const service = createServiceClient();
  const { error } = await service
    .from("billing_invoices")
    .update({ status: "canceled" })
    .eq("id", invoiceId)
    .eq("status", "pending");
  if (error) throw new Error(`Не удалось отменить счёт: ${error.message}`);
}

export async function logBillingEvent(params: {
  companyId?: string | null;
  invoiceId?: string | null;
  type: string;
  dedupeKey?: string | null;
  payload?: Record<string, unknown>;
}): Promise<void> {
  const service = createServiceClient();
  const { error } = await service.from("billing_events").insert({
    company_id: params.companyId ?? null,
    invoice_id: params.invoiceId ?? null,
    type: params.type,
    dedupe_key: params.dedupeKey ?? null,
    payload: params.payload ?? {},
  });
  // Повтор события с тем же dedupe_key — норма (вебхуки дублируются).
  if (error && !error.message.includes("duplicate key")) {
    console.error("[billing] event insert failed:", error.message);
  }
}

/**
 * Готовит ссылку на оплату. Без ключей эквайринга возвращает null:
 * счёт остаётся в статусе pending, клиент получает его письмом.
 */
export async function attachPaymentLink(invoice: InvoiceRow, billingEmail: string | null): Promise<string | null> {
  if (!isFreedomPayConfigured()) return null;

  const payment = await createPaymentPage(invoice, billingEmail);
  const service = createServiceClient();
  const { error } = await service
    .from("billing_invoices")
    .update({ payment_url: payment.redirectUrl, provider: "freedompay" })
    .eq("id", invoice.id)
    .eq("status", "pending");
  if (error) throw new Error(`Не удалось сохранить ссылку на оплату: ${error.message}`);

  return payment.redirectUrl;
}
