import { type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { parseResultCallback } from "@/lib/billing/freedompay";
import { logBillingEvent, markInvoicePaid, type InvoiceRow } from "@/lib/billing/invoices";
import { getPlanOffers, getSubscription } from "@/lib/billing/data";
import { sendPaymentReceivedEmail } from "@/lib/billing/emails";

export const dynamic = "force-dynamic";

function xml(status: "ok" | "rejected" | "error"): Response {
  return new Response(
    `<?xml version="1.0" encoding="utf-8"?><response><pg_status>${status}</pg_status></response>`,
    { headers: { "Content-Type": "text/xml" } },
  );
}

/**
 * Колбэк Freedom Pay. Публичный URL без сессии: доверяем только подписи
 * pg_sig, затем сверяем номер заказа и сумму. Повторный колбэк безопасен —
 * биллинг_mark_invoice_paid идемпотентна.
 */
export async function POST(request: NextRequest) {
  const fields: Record<string, string> = {};
  try {
    const form = await request.formData();
    form.forEach((value, key) => {
      if (typeof value === "string") fields[key] = value;
    });
  } catch (error) {
    console.error("[fp-result] не удалось разобрать тело:", error);
    return xml("error");
  }

  try {
    const callback = parseResultCallback(fields);
    const service = createServiceClient();

    const { data: invoiceData, error: invoiceError } = await service
      .from("billing_invoices")
      .select("*")
      .eq("number", callback.orderId)
      .maybeSingle();

    if (invoiceError || !invoiceData) {
      console.error("[fp-result] счёт не найден:", callback.orderId, invoiceError?.message);
      return xml("rejected");
    }
    const invoice = invoiceData as InvoiceRow;

    if (Math.abs(Number(invoice.amount) - callback.amount) > 0.01) {
      console.error("[fp-result] сумма не совпадает:", invoice.amount, callback.amount, invoice.number);
      await logBillingEvent({
        companyId: invoice.company_id,
        invoiceId: invoice.id,
        type: "payment_amount_mismatch",
        payload: { expected: invoice.amount, received: callback.amount },
      });
      return xml("rejected");
    }

    if (!callback.success) {
      await logBillingEvent({
        companyId: invoice.company_id,
        invoiceId: invoice.id,
        type: "payment_failed",
        dedupeKey: callback.paymentId ? `fp-failed:${callback.paymentId}` : null,
        payload: { reason: fields.pg_failure_description ?? null },
      });
      return xml("ok");
    }

    const paid = await markInvoicePaid(invoice.id, "freedompay", callback.paymentId);

    await logBillingEvent({
      companyId: invoice.company_id,
      invoiceId: invoice.id,
      type: paid.alreadyPaid ? "payment_duplicate" : "payment_success",
      dedupeKey: callback.paymentId ? `fp:${callback.paymentId}` : null,
      payload: { amount: callback.amount, alreadyPaid: paid.alreadyPaid },
    });

    if (!paid.alreadyPaid) {
      const subscription = await getSubscription(invoice.company_id);
      const offers = await getPlanOffers();
      const offer = offers.find((item) => item.code === invoice.plan_code);
      if (subscription?.billing_email && offer) {
        await sendPaymentReceivedEmail({
          to: subscription.billing_email,
          invoice,
          offer,
          periodEnd: paid.periodEnd,
        }).catch((error) => console.error("[fp-result] письмо об оплате не ушло:", error));
      }
    }

    return xml("ok");
  } catch (error) {
    console.error("[fp-result] ошибка:", error);
    const message = error instanceof Error ? error.message : "";
    // Неверная подпись — атака или чужая интеграция: повторять не нужно.
    // Остальные сбои (БД недоступна) отдаём 500, чтобы Freedom Pay повторил
    // уведомление: он повторяет только ответы вне 2xx.
    const badSignature = /подпис/i.test(message);
    return new Response(
      `<?xml version="1.0" encoding="utf-8"?><response><pg_status>error</pg_status></response>`,
      { status: badSignature ? 400 : 500, headers: { "Content-Type": "text/xml" } },
    );
  }
}
