"use client";

import { useMemo, useState } from "react";
import {
  amountForPlan,
  billingReadOnly,
  daysUntil,
  formatTenge,
  isPurchasablePlan,
  planFeatures,
  type BillingPeriod,
  type PlanCode,
  type PlanOffer,
  type SubscriptionRow,
} from "@/lib/billing/plans";
import type { InvoiceRow } from "@/lib/billing/invoices";
import { createInvoiceAction, payInvoiceAction, startTrialAction } from "./actions";

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

const STATUS_COLOR: Record<string, string> = {
  trialing: "#2563eb",
  active: "#059669",
  past_due: "#d97706",
  blocked: "#dc2626",
  canceled: "#6b7280",
  pending: "#d97706",
  paid: "#059669",
  expired: "#6b7280",
};

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLOR[status] ?? "#6b7280";
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 30%, transparent)` }}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });
}

export default function BillingClient({
  subscription,
  offers,
  invoices,
  canManage,
  providerReady,
  email,
  notice,
}: {
  subscription: SubscriptionRow | null;
  offers: PlanOffer[];
  invoices: InvoiceRow[];
  canManage: boolean;
  providerReady: boolean;
  readOnly: boolean;
  email: string | null;
  notice: "paid" | "failed" | null;
}) {
  const purchasable = offers.filter((offer) => isPurchasablePlan(offer.code));
  const [period, setPeriod] = useState<BillingPeriod>(subscription?.billing_period ?? "monthly");
  const [selected, setSelected] = useState<PlanCode>(purchasable[0]?.code ?? "start");
  const [waAddon, setWaAddon] = useState(false);
  const [busy, setBusy] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ number: string; amount: number; emailSent: boolean } | null>(null);
  const [busyTrial, setBusyTrial] = useState(false);

  const offer = purchasable.find((item) => item.code === selected) ?? purchasable[0];
  const amount = useMemo(
    () => (offer ? amountForPlan(offer, period, waAddon && offer.wa_addon_price > 0) : 0),
    [offer, period, waAddon],
  );

  const daysLeft = daysUntil(subscription?.status === "trialing" ? subscription.trial_ends_at : subscription?.current_period_end ?? null);
  const readOnlyNow = billingReadOnly(subscription);

  async function handleCreateInvoice() {
    if (!offer) return;
    setError("");
    setCreated(null);
    setBusy(true);
    try {
      const result = await createInvoiceAction({
        planCode: offer.code,
        period,
        waAddon: waAddon && offer.wa_addon_price > 0,
      });
      if (result.paymentUrl) {
        window.location.assign(result.paymentUrl);
        return;
      }
      setCreated({ number: result.number, amount: result.amount, emailSent: result.emailSent });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось выставить счёт.");
    } finally {
      setBusy(false);
    }
  }

  async function handleStartTrial() {
    setError("");
    setBusyTrial(true);
    try {
      await startTrialAction();
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось активировать пилот.");
    } finally {
      setBusyTrial(false);
    }
  }

  async function handlePay(invoiceId: string) {
    setError("");
    setPayingId(invoiceId);
    try {
      const result = await payInvoiceAction(invoiceId);
      if (result.paymentUrl) window.location.assign(result.paymentUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось открыть оплату.");
    } finally {
      setPayingId(null);
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-display text-[var(--text)]">Оплата и тариф</h1>
        <p className="text-sm text-[var(--muted)] mt-1">Подписка, счета и продление — без звонков и переписок.</p>
      </div>

      {notice === "paid" && (
        <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "color-mix(in srgb, #059669 12%, transparent)", border: "1px solid color-mix(in srgb, #059669 32%, transparent)" }}>
          Оплата принята. Если тариф ещё не обновился, обновите страницу через минуту — подтверждение приходит от банка.
        </div>
      )}
      {notice === "failed" && (
        <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "color-mix(in srgb, #dc2626 10%, transparent)", border: "1px solid color-mix(in srgb, #dc2626 30%, transparent)" }}>
          Оплата не прошла. Счёт остался в списке — можно попробовать снова или оплатить по реквизитам из письма.
        </div>
      )}
      {error && (
        <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "color-mix(in srgb, #dc2626 10%, transparent)", border: "1px solid color-mix(in srgb, #dc2626 30%, transparent)" }}>
          {error}
        </div>
      )}

      <section className="rounded-2xl p-5" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Текущий тариф</p>
            <p className="text-xl font-bold text-[var(--text)] mt-1">
              {subscription ? offers.find((item) => item.code === subscription.plan_code)?.name ?? subscription.plan_code : "Тариф не выбран"}
            </p>
          </div>
          {subscription && <StatusBadge status={subscription.status} />}
        </div>

        {subscription ? (
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-[var(--muted)]">{subscription.status === "trialing" ? "Пилот до" : "Оплачено до"}</p>
              <p className="text-[var(--text)]">{formatDate(subscription.status === "trialing" ? subscription.trial_ends_at : subscription.current_period_end)}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--muted)]">Осталось</p>
              <p className="text-[var(--text)]">
                {daysLeft === null ? "—" : daysLeft >= 0 ? `${daysLeft} дн.` : `просрочка ${Math.abs(daysLeft)} дн.`}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--muted)]">Сумма последнего периода</p>
              <p className="text-[var(--text)]">{subscription.amount ? formatTenge(subscription.amount) : "0 ₸"}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--muted)]">Срок оплаты</p>
              <p className="text-[var(--text)]">{subscription.billing_period === "yearly" ? "год" : "месяц"}</p>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-[var(--muted)] mt-3">
              Пилот ещё не активирован. Данные доступны, ввод не ограничен.
            </p>
            {canManage && (
              <button
                onClick={handleStartTrial}
                disabled={busyTrial}
                className="mt-3 text-sm font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50"
                style={{ background: "var(--accent)", color: "var(--accent-text)" }}
              >
                {busyTrial ? "Активируем…" : "Активировать пилот 30 дней"}
              </button>
            )}
          </>
        )}

        {subscription?.status === "trialing" && daysLeft !== null && daysLeft <= 5 && daysLeft >= 0 && (
          <p className="text-sm mt-3" style={{ color: "#d97706" }}>
            Пилот заканчивается через {daysLeft} дн. После окончания ввод данных заблокируется через 7 дней.
          </p>
        )}

        {readOnlyNow && (
          <p className="text-sm mt-3" style={{ color: "#dc2626" }}>
            Доступ только на чтение: тариф просрочен больше 7 дней. Данные сохранены, ввод восстановится после оплаты.
          </p>
        )}
      </section>

      <section className="rounded-2xl p-5" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <h2 className="text-base font-semibold text-[var(--text)]">Выбрать тариф</h2>
          <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            {(["monthly", "yearly"] as BillingPeriod[]).map((option) => (
              <button
                key={option}
                onClick={() => setPeriod(option)}
                className="px-3 py-1.5 text-xs font-semibold"
                style={{
                  background: period === option ? "var(--accent)" : "transparent",
                  color: period === option ? "var(--accent-text)" : "var(--muted)",
                }}
              >
                {option === "monthly" ? "Месяц" : "Год −20%"}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          {purchasable.length === 0 && (
            <p className="text-sm text-[var(--muted)]">
              Тарифы не загрузились. Обновите страницу.
            </p>
          )}
          {purchasable.map((item) => {
            const isSelected = item.code === selected;
            const monthly = amountForPlan(item, "monthly", false);
            return (
              <button
                key={item.code}
                onClick={() => {
                  setSelected(item.code);
                  if (item.wa_addon_price <= 0) setWaAddon(false);
                  setCreated(null);
                }}
                className="w-full text-left rounded-xl p-4 transition-colors"
                style={{
                  background: isSelected ? "color-mix(in srgb, var(--accent) 8%, transparent)" : "var(--surface-2)",
                  border: `1px solid ${isSelected ? "var(--accent)" : "var(--border)"}`,
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 font-semibold text-[var(--text)]">
                    {item.name}
                    {item.code === "plant" && (
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ background: "var(--accent-15)", color: "var(--accent)" }}>
                        Популярный
                      </span>
                    )}
                  </span>
                  <span className="text-sm font-semibold text-[var(--text)]">{formatTenge(monthly)}/мес</span>
                </div>
                <p className="text-xs text-[var(--muted)] mt-1">{item.summary}</p>
                <p className="text-xs text-[var(--muted)] mt-1">
                  {item.code === "start" ? "1 склад, пользователи без лимита" : item.code === "plant" ? "до 3 цехов, 1 WhatsApp-номер" : "цеха без лимита, 2 WhatsApp-номера"}
                </p>
                <ul className="mt-2 space-y-0.5">
                  {planFeatures(item.code).map((feature) => (
                    <li key={feature} className="text-xs text-[var(--muted)]">· {feature}</li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>

        {offer && offer.wa_addon_price > 0 && (
          <label className="flex items-center gap-2 mt-4 text-sm text-[var(--text)]">
            <input type="checkbox" checked={waAddon} onChange={(e) => { setWaAddon(e.target.checked); setCreated(null); }} />
            Добавить WhatsApp-канал (+{formatTenge(offer.wa_addon_price)}/мес)
          </label>
        )}

        <div className="mt-5 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs text-[var(--muted)]">К оплате за {period === "yearly" ? "год" : "месяц"}</p>
            <p className="text-lg font-bold text-[var(--text)]">{formatTenge(amount)}</p>
          </div>
          <button
            onClick={handleCreateInvoice}
            disabled={!canManage || busy || !offer}
            className="dp-btn-primary px-5 py-2.5 disabled:opacity-50"
          >
            {busy ? "Выставляем счёт…" : providerReady ? "Перейти к оплате" : "Выставить счёт"}
          </button>
        </div>

        {!canManage && <p className="text-xs text-[var(--muted)] mt-2">Счёт выставляет администратор компании.</p>}
        {!providerReady && (
          <p className="text-xs text-[var(--muted)] mt-2">
            Онлайн-оплата картой ещё не подключена. Счёт приходит на {email ?? "email"} с реквизитами; после оплаты тариф включится.
          </p>
        )}

        {created && (
          <div className="mt-4 rounded-xl p-4 text-sm" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
            Счёт {created.number} на {formatTenge(created.amount)} создан.
            {created.emailSent ? " Копия отправлена на email." : " Письмо не ушло — сохраните номер счёта."}
          </div>
        )}
      </section>


      <section className="rounded-2xl p-5" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
        <h2 className="text-base font-semibold text-[var(--text)] mb-1">Что входит в тарифы</h2>
        <p className="text-xs text-[var(--muted)] mb-3">Разница в цене — это модули и масштаб. Базовый учёт есть везде.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ borderCollapse: "collapse", minWidth: 560 }}>
            <thead>
              <tr>
                <th className="text-left p-2" style={{ color: "var(--muted)", borderBottom: "1px solid var(--border)" }}>Возможность</th>
                {purchasable.map((item) => (
                  <th key={item.code} className="text-center p-2" style={{ color: "var(--text)", borderBottom: "1px solid var(--border)" }}>{item.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { label: "Учёт, движение, остатки", codes: ["start", "plant", "network"] },
                { label: "Отчёты и Excel", codes: ["start", "plant", "network"] },
                { label: "Роли и аудит", codes: ["start", "plant", "network"] },
                { label: "Нормы ГОСТ и перерасход", codes: ["plant", "network"] },
                { label: "Брак с причиной и возвраты", codes: ["start", "plant", "network"] },
                { label: "WhatsApp-канал", codes: ["plant", "network"] },
                { label: "Несколько цехов", codes: ["plant", "network"] },
                { label: "Сезонное планирование", codes: ["network"] },
              ].map((row) => (
                <tr key={row.label}>
                  <td className="p-2" style={{ color: "var(--muted)", borderBottom: "1px solid var(--border)" }}>{row.label}</td>
                  {purchasable.map((item) => (
                    <td key={item.code} className="p-2 text-center" style={{ color: "var(--text)", borderBottom: "1px solid var(--border)" }}>
                      {row.codes.includes(item.code) ? "✓" : "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl p-3" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
            <p className="text-xs font-semibold text-[var(--text)]">За что платите в «Завод»</p>
            <p className="text-xs text-[var(--muted)] mt-1">Нормы ГОСТ, перерасход, WhatsApp и до 3 цехов. Видно, где теряются материалы.</p>
          </div>
          <div className="rounded-xl p-3" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
            <p className="text-xs font-semibold text-[var(--text)]">За что платите в «Сеть»</p>
            <p className="text-xs text-[var(--muted)] mt-1">Цеха без лимита и 2 WhatsApp-номера. Площадки в одной системе.</p>
          </div>
          <div className="rounded-xl p-3" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
            <p className="text-xs font-semibold text-[var(--text)]">Годовая оплата</p>
            <p className="text-xs text-[var(--muted)] mt-1">12 месяцев по цене 10: экономия 20% на каждом тарифе.</p>
          </div>
        </div>
        <div className="mt-4 text-xs text-[var(--muted)] space-y-1">
          <p>Дополнительно: WhatsApp для «Старта» +14 900 ₸/мес, внедрение и перенос справочников 49 900 ₸ разово (бесплатно при годовой оплате).</p>
          <p>Пользователи не ограничены. Счёт фиксирует состав и сумму до оплаты.</p>
        </div>
      </section>

      <section className="rounded-2xl p-5" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
        <h2 className="text-base font-semibold text-[var(--text)] mb-3">Вопросы по оплате</h2>
        <div className="space-y-2 text-sm">
          {[
            ["Как выставляется счёт?", "Выберите тариф и период, нажмите «Выставить счёт». Счёт придёт на email компании, копия останется в разделе «Счета»."],
            ["Как оплатить?", "По реквизитам из письма. Когда подключён эквайринг, появляется кнопка оплаты картой на странице Freedom Pay."],
            ["Что будет после пилота?", "Данные остаются доступны для чтения. Ввод блокируется через 7 дней после окончания периода, пока тариф не оплачен."],
            ["Можно ли перейти на другой тариф?", "Да, новый тариф начнётся после оплаты счёта. Остаток оплаченного периода не сгорает при продлении того же тарифа."],
            ["Где посмотреть состав тарифа?", "В карточках выше, в таблице сравнения и в письме со счётом перечислено, что входит."],
            ["Кому писать по счёту?", `Ответом на письмо со счётом или на ${email ?? "email компании"}.`],
          ].map(([q, a]) => (
            <details key={q} className="rounded-xl px-3 py-2" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
              <summary className="cursor-pointer text-[var(--text)]">{q}</summary>
              <p className="text-xs text-[var(--muted)] mt-2">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="rounded-2xl p-5" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
        <h2 className="text-base font-semibold text-[var(--text)] mb-3">Счета</h2>
        {invoices.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Счетов пока нет.</p>
        ) : (
          <div className="space-y-2">
            {invoices.map((invoice) => (
              <div
                key={invoice.id}
                className="flex items-center justify-between gap-3 flex-wrap rounded-xl px-3 py-2.5"
                style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--text)]">{invoice.number}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {formatDate(invoice.created_at)} · {formatTenge(invoice.amount)} · до {formatDate(invoice.due_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={invoice.status} />
                  {invoice.status === "pending" && canManage && (
                    <button
                      onClick={() => handlePay(invoice.id)}
                      disabled={payingId === invoice.id || !providerReady}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50"
                      style={{ background: "var(--accent)", color: "var(--accent-text)" }}
                    >
                      {payingId === invoice.id ? "Открываем…" : "Оплатить"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
