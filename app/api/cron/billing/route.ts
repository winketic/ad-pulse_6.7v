import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getPlanOffers } from "@/lib/billing/data";
import {
  sendPaymentOverdueEmail,
  sendTrialEndingEmail,
} from "@/lib/billing/emails";
import type { InvoiceRow } from "@/lib/billing/invoices";
import { daysUntil, type SubscriptionRow } from "@/lib/billing/plans";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Занимает ключ идемпотентности: true — событие новое, false — уже было. */
async function claimEvent(params: {
  key: string;
  type: string;
  companyId: string;
  invoiceId?: string | null;
}): Promise<boolean> {
  const service = createServiceClient();
  const { error } = await service.from("billing_events").insert({
    company_id: params.companyId,
    invoice_id: params.invoiceId ?? null,
    type: params.type,
    dedupe_key: params.key,
    payload: {},
  });
  if (!error) return true;
  if (error.code === "23505") return false;
  console.error("[cron/billing] event claim failed:", error.message);
  return false;
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();
  const now = new Date();
  const nowIso = now.toISOString();

  // ── 1. Переходы статусов ───────────────────────────────────────────────────
  // У старых и ручных подписок current_period_end мог остаться пустым:
  // без него гейт и блокировка не сработают. Переносим дату пилота построчно.
  const { data: withoutPeriod } = await service
    .from("subscriptions")
    .select("company_id, trial_ends_at")
    .eq("status", "trialing")
    .is("current_period_end", null)
    .not("trial_ends_at", "is", null);

  for (const row of withoutPeriod ?? []) {
    const { error: fillError } = await service
      .from("subscriptions")
      .update({ current_period_end: row.trial_ends_at })
      .eq("company_id", row.company_id);
    if (fillError) console.error("[cron/billing] period backfill:", fillError.message);
  }

  const trialExpired = await service
    .from("subscriptions")
    .update({ status: "past_due", updated_at: nowIso })
    .eq("status", "trialing")
    .lte("trial_ends_at", nowIso)
    .not("trial_ends_at", "is", null)
    .select("company_id");

  const paidExpired = await service
    .from("subscriptions")
    .update({ status: "past_due", updated_at: nowIso })
    .eq("status", "active")
    .lte("current_period_end", nowIso)
    .not("current_period_end", "is", null)
    .select("company_id");

  const graceDeadline = new Date(now.getTime() - 7 * DAY_MS).toISOString();
  const blocked = await service
    .from("subscriptions")
    .update({ status: "blocked", updated_at: nowIso })
    .eq("status", "past_due")
    .lte("current_period_end", graceDeadline)
    .not("current_period_end", "is", null)
    .select("company_id");

  if (trialExpired.error) console.error("[cron/billing] trial update:", trialExpired.error.message);
  if (paidExpired.error) console.error("[cron/billing] active update:", paidExpired.error.message);
  if (blocked.error) console.error("[cron/billing] block update:", blocked.error.message);

  // ── 2. Напоминания по пилоту ──────────────────────────────────────────────
  const offers = await getPlanOffers();
  const { data: subscriptions, error: subscriptionsError } = await service
    .from("subscriptions")
    .select("*");
  if (subscriptionsError) {
    // Окно до применения миграции 059: таблиц ещё нет, это не сбой cron.
    if (/does not exist|schema cache|PGRST205|42P01/i.test(subscriptionsError.message)) {
      return NextResponse.json({ ok: true, skipped: "migration_059_not_applied" });
    }
    console.error("[cron/billing] subscriptions:", subscriptionsError.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  let trialEmails = 0;
  for (const row of (subscriptions ?? []) as SubscriptionRow[]) {
    if (!row.billing_email) continue;
    const left = daysUntil(row.trial_ends_at, now);
    if (left === null) continue;

    if (row.status === "trialing" && left <= 5 && left > 0) {
      const claimed = await claimEvent({
        key: `trial-5d:${row.company_id}`,
        type: "trial_reminder_5d",
        companyId: row.company_id,
      });
      if (!claimed) continue;
      await sendTrialEndingEmail({ to: row.billing_email, daysLeft: left, periodEnd: row.trial_ends_at })
        .then(() => { trialEmails += 1; })
        .catch((error) => console.error("[cron/billing] trial email:", error));
    }

    if (row.status === "past_due" && left <= 0 && left >= -1) {
      const claimed = await claimEvent({
        key: `trial-0d:${row.company_id}`,
        type: "trial_ended",
        companyId: row.company_id,
      });
      if (!claimed) continue;
      await sendTrialEndingEmail({ to: row.billing_email, daysLeft: 0, periodEnd: row.trial_ends_at })
        .then(() => { trialEmails += 1; })
        .catch((error) => console.error("[cron/billing] trial ended email:", error));
    }
  }

  // ── 3. Напоминания по счетам (+3 дня после срока) ─────────────────────────
  const overdueBefore = new Date(now.getTime() - 3 * DAY_MS).toISOString();
  const { data: invoices } = await service
    .from("billing_invoices")
    .select("*")
    .eq("status", "pending")
    .lte("due_at", overdueBefore);

  let overdueEmails = 0;
  for (const invoice of (invoices ?? []) as InvoiceRow[]) {
    const { data: subscription } = await service
      .from("subscriptions")
      .select("billing_email")
      .eq("company_id", invoice.company_id)
      .maybeSingle();
    const to = subscription?.billing_email;
    if (!to) continue;

    const offer = offers.find((item) => item.code === invoice.plan_code);
    if (!offer) continue;

    const claimed = await claimEvent({
      key: `invoice-overdue:${invoice.id}`,
      type: "invoice_overdue",
      companyId: invoice.company_id,
      invoiceId: invoice.id,
    });
    if (!claimed) continue;

    await sendPaymentOverdueEmail({ to, invoice, offer })
      .then(() => { overdueEmails += 1; })
      .catch((error) => console.error("[cron/billing] overdue email:", error));
  }

  return NextResponse.json({
    ok: true,
    transitions: {
      trialExpired: trialExpired.data?.length ?? 0,
      paidExpired: paidExpired.data?.length ?? 0,
      blocked: blocked.data?.length ?? 0,
    },
    emails: { trial: trialEmails, overdue: overdueEmails },
  });
}
