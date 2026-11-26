// Тарифы AD Pulse. Цифры совпадают с PLAN_PRODAZH_AD_PULSE.md §7.1:
// пилот 0 ₸ на 30 дней, Старт 14 900, Завод 29 900, Сеть 54 900,
// WhatsApp-канал для Старта +14 900, годовая оплата −20%.
// Каталог в базе (plan_offers) — источник для интерфейса и счетов;
// здесь только типы, формулы и правила статусов.

export type PlanCode = "trial" | "start" | "plant" | "network";
export type BillingPeriod = "monthly" | "yearly";
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "blocked" | "canceled";

export type PlanOffer = {
  code: PlanCode;
  name: string;
  monthly_price: number;
  wa_numbers: number;
  wa_addon_price: number;
  summary: string;
  sort_order: number;
};

export type SubscriptionRow = {
  company_id: string;
  plan_code: PlanCode;
  status: SubscriptionStatus;
  billing_period: BillingPeriod;
  wa_addon: boolean;
  billing_email: string | null;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  amount: number | null;
};

export const TRIAL_DAYS = 30;
export const GRACE_PERIOD_DAYS = 7;
export const YEARLY_DISCOUNT = 0.2;

/** Месячная цена с опцией WhatsApp; годовая — те же 12 месяцев со скидкой 20%. */
export function amountForPlan(
  offer: Pick<PlanOffer, "monthly_price" | "wa_addon_price">,
  period: BillingPeriod,
  waAddon: boolean,
): number {
  const monthly = offer.monthly_price + (waAddon ? offer.wa_addon_price : 0);
  if (period === "yearly") return Math.round(monthly * 12 * (1 - YEARLY_DISCOUNT));
  return monthly;
}

/** Тариф, который можно купить. Пилот не продаётся. */
export function isPurchasablePlan(code: string): code is Exclude<PlanCode, "trial"> {
  return code === "start" || code === "plant" || code === "network";
}

/**
 * Только чтение после 7 дней просрочки. Зеркалит private.company_can_write()
 * из миграции 059: пока статус не past_due и не blocked, запись разрешена.
 */
export function billingReadOnly(
  subscription: Pick<SubscriptionRow, "status" | "current_period_end" | "trial_ends_at"> | null,
  now: Date = new Date(),
): boolean {
  if (!subscription) return false;
  if (subscription.status === "blocked" || subscription.status === "canceled") return true;
  if (subscription.status !== "past_due") return false;
  const end = subscription.current_period_end ?? subscription.trial_ends_at;
  if (!end) return false;
  const deadline = new Date(end).getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;
  return now.getTime() > deadline;
}

/** Сколько целых дней осталось до даты; отрицательное значение — просрочка. */
export function daysUntil(date: string | null, now: Date = new Date()): number | null {
  if (!date) return null;
  return Math.ceil((new Date(date).getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

export function planName(offers: PlanOffer[], code: string): string {
  return offers.find((offer) => offer.code === code)?.name ?? code;
}

export function formatTenge(amount: number): string {
  return `${amount.toLocaleString("ru-RU")} ₸`;
}
