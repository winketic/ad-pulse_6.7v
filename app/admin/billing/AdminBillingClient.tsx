"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cancelInvoiceByAdmin, grantTrialByAdmin, markInvoicePaidByAdmin } from "./actions";

type Invoice = {
  id: string;
  company_id: string;
  company_name: string;
  number: string;
  plan_code: string;
  billing_period: string;
  amount: number;
  status: string;
  created_at: string;
  due_at: string | null;
};

type Subscription = {
  company_id: string;
  company_name: string;
  plan_code: string;
  status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
  billing_email: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  trialing: "Пилот",
  active: "Активна",
  past_due: "Просрочена",
  blocked: "Заблокирована",
  canceled: "Отменена",
  pending: "Ожидает оплаты",
  paid: "Оплачен",
  expired: "Истёк",
};

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString("ru-RU") : "—";
}

export default function AdminBillingClient({
  invoices,
  subscriptions,
}: {
  invoices: Invoice[];
  subscriptions: Subscription[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function run(key: string, action: () => Promise<void>) {
    setBusy(key);
    setError("");
    try {
      await action();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "color-mix(in srgb, #dc2626 10%, transparent)", border: "1px solid color-mix(in srgb, #dc2626 30%, transparent)" }}>
          {error}
        </div>
      )}

      <section className="rounded-2xl p-5" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
        <h2 className="text-base font-semibold text-[var(--text)] mb-3">Подписки</h2>
        {subscriptions.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Подписок нет.</p>
        ) : (
          <div className="space-y-2">
            {subscriptions.map((sub) => (
              <div
                key={sub.company_id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2.5"
                style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--text)] truncate">{sub.company_name}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {sub.plan_code} · {STATUS_LABEL[sub.status] ?? sub.status} · до{" "}
                    {formatDate(sub.status === "trialing" ? sub.trial_ends_at : sub.current_period_end)}
                    {sub.billing_email ? ` · ${sub.billing_email}` : ""}
                  </p>
                </div>
                <button
                  onClick={() => run(`trial:${sub.company_id}`, () => grantTrialByAdmin(sub.company_id, 30))}
                  disabled={busy === `trial:${sub.company_id}`}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50"
                  style={{ background: "var(--surface-3)", color: "var(--text)", border: "1px solid var(--border)" }}
                >
                  {busy === `trial:${sub.company_id}` ? "…" : "Пилот 30 дней"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl p-5" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
        <h2 className="text-base font-semibold text-[var(--text)] mb-3">Счета</h2>
        {invoices.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Счетов нет.</p>
        ) : (
          <div className="space-y-2">
            {invoices.map((invoice) => (
              <div
                key={invoice.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2.5"
                style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--text)]">
                    {invoice.number} · {invoice.company_name}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    {invoice.plan_code} · {invoice.amount.toLocaleString("ru-RU")} ₸ ·{" "}
                    {STATUS_LABEL[invoice.status] ?? invoice.status} · до {formatDate(invoice.due_at)}
                  </p>
                </div>
                {invoice.status === "pending" && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => run(`pay:${invoice.id}`, () => markInvoicePaidByAdmin(invoice.id))}
                      disabled={busy === `pay:${invoice.id}`}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50"
                      style={{ background: "var(--accent)", color: "var(--accent-text)" }}
                    >
                      {busy === `pay:${invoice.id}` ? "…" : "Оплачен"}
                    </button>
                    <button
                      onClick={() => run(`cancel:${invoice.id}`, () => cancelInvoiceByAdmin(invoice.id))}
                      disabled={busy === `cancel:${invoice.id}`}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50"
                      style={{ background: "transparent", color: "var(--muted)", border: "1px solid var(--border)" }}
                    >
                      Отменить
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
