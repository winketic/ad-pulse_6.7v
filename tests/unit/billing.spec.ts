import { test, expect } from "playwright/test";
import {
  amountForPlan,
  billingReadOnly,
  daysUntil,
  isPurchasablePlan,
  GRACE_PERIOD_DAYS,
  type PlanOffer,
} from "../../lib/billing/plans";
import {
  parseResultCallback,
  parseXmlFields,
  pgSignature,
  verifyPgSignature,
} from "../../lib/billing/freedompay";
import { makeInvoiceNumber } from "../../lib/billing/invoices";

const START: PlanOffer = {
  code: "start",
  name: "Старт",
  monthly_price: 14900,
  wa_numbers: 0,
  wa_addon_price: 14900,
  summary: "",
  sort_order: 1,
};

test("pgSignature совпадает с вектором из документации Freedom Pay", () => {
  // https://docs.freedompay.kz/overview-643556m0, пример запроса /g2g/payment
  const params: Record<string, string> = {
    pg_merchant_id: "12345",
    pg_order_id: "order_1001",
    pg_amount: "100",
    pg_currency: "KZT",
    pg_description: "Order #1001",
    pg_card_name: "IVAN IVANOV",
    pg_card_cvc: "123",
    pg_card_month: "12",
    pg_card_year: "30",
    pg_card_pan: "4716047261941981",
    pg_user_phone: "77777777777",
    pg_user_email: "user@example.com",
    pg_salt: "a1b2c3d4",
  };

  expect(pgSignature("payment", params, "test_secret_key")).toBe("b7ccbf6b20dc8125c70aa4e21617a2c0");
});

test("verifyPgSignature отклоняет изменённую сумму и отсутствующую подпись", () => {
  const secret = "test_secret_key";
  const params: Record<string, string> = {
    pg_order_id: "ADP-20261126-AB12CD",
    pg_amount: "14900.00",
    pg_result: "1",
    pg_salt: "abc123",
  };
  const signed = { ...params, pg_sig: pgSignature("fp-result", params, secret) };

  expect(verifyPgSignature("fp-result", signed, secret)).toBe(true);
  expect(verifyPgSignature("fp-result", { ...signed, pg_amount: "1.00" }, secret)).toBe(false);
  expect(verifyPgSignature("fp-result", { ...signed, pg_sig: "" }, secret)).toBe(false);
});

test("parseResultCallback разбирает успешный колбэк и требует подпись", () => {
  process.env.FREEDOMPAY_SECRET_KEY = "test_secret_key";
  const params: Record<string, string> = {
    pg_order_id: "ADP-20261126-AB12CD",
    pg_payment_id: "1016061000044",
    pg_amount: "14900.00",
    pg_currency: "KZT",
    pg_result: "1",
    pg_salt: "ZiYy",
  };
  const fields = { ...params, pg_sig: pgSignature("fp-result", params, "test_secret_key") };

  expect(parseResultCallback(fields)).toEqual({
    orderId: "ADP-20261126-AB12CD",
    paymentId: "1016061000044",
    amount: 14900,
    success: true,
  });

  expect(() => parseResultCallback({ ...fields, pg_amount: "1.00" })).toThrow(/подпись/i);
});

test("parseXmlFields читает плоский ответ Freedom Pay", () => {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<response>
  <pg_status>ok</pg_status>
  <pg_payment_id>1016061000044</pg_payment_id>
  <pg_redirect_url>https://customer.freedompay.kz/pay.html?customer=x</pg_redirect_url>
</response>`;
  expect(parseXmlFields(xml)).toMatchObject({
    pg_status: "ok",
    pg_payment_id: "1016061000044",
    pg_redirect_url: "https://customer.freedompay.kz/pay.html?customer=x",
  });
});

test("amountForPlan: месяц, WhatsApp-опция и годовая скидка 20%", () => {
  expect(amountForPlan(START, "monthly", false)).toBe(14900);
  expect(amountForPlan(START, "monthly", true)).toBe(29800);
  expect(amountForPlan(START, "yearly", false)).toBe(Math.round(14900 * 12 * 0.8));
  expect(amountForPlan(START, "yearly", true)).toBe(Math.round(29800 * 12 * 0.8));
});

test("isPurchasablePlan: пилот не продаётся", () => {
  expect(isPurchasablePlan("trial")).toBe(false);
  expect(isPurchasablePlan("start")).toBe(true);
  expect(isPurchasablePlan("network")).toBe(true);
  expect(isPurchasablePlan("enterprise")).toBe(false);
});

test("billingReadOnly: 7 дней после окончания, затем только чтение", () => {
  const now = new Date("2026-11-26T10:00:00Z");
  const threeDaysAgo = new Date(now.getTime() - 3 * 864e5).toISOString();
  const tenDaysAgo = new Date(now.getTime() - 10 * 864e5).toISOString();

  expect(billingReadOnly(null, now)).toBe(false);
  expect(billingReadOnly({ status: "trialing", current_period_end: tenDaysAgo, trial_ends_at: tenDaysAgo }, now)).toBe(false);
  expect(billingReadOnly({ status: "active", current_period_end: future(now), trial_ends_at: null }, now)).toBe(false);
  expect(billingReadOnly({ status: "past_due", current_period_end: threeDaysAgo, trial_ends_at: null }, now)).toBe(false);
  expect(billingReadOnly({ status: "past_due", current_period_end: tenDaysAgo, trial_ends_at: null }, now)).toBe(true);
  expect(billingReadOnly({ status: "blocked", current_period_end: threeDaysAgo, trial_ends_at: null }, now)).toBe(true);
  expect(GRACE_PERIOD_DAYS).toBe(7);
});

test("daysUntil считает целые дни и просрочку", () => {
  const now = new Date("2026-11-26T10:00:00Z");
  expect(daysUntil(future(now, 5), now)).toBe(5);
  expect(daysUntil(new Date(now.getTime() - 2 * 864e5).toISOString(), now)).toBe(-2);
  expect(daysUntil(null, now)).toBeNull();
});

test("makeInvoiceNumber: префикс, дата и случайный хвост", () => {
  expect(makeInvoiceNumber(new Date("2026-11-26T10:00:00Z"))).toMatch(/^ADP-20261126-[0-9A-F]{6}$/);
  expect(makeInvoiceNumber()).not.toBe(makeInvoiceNumber());
});

function future(now: Date, days = 10): string {
  return new Date(now.getTime() + days * 864e5).toISOString();
}

test("код подтверждения: 6 цифр, совпадение, истечение и попытки", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- динамический import() не работает в transform-раннере Playwright для .ts
  const signupCodeMod = require("../../lib/auth/signupCode") as typeof import("../../lib/auth/signupCode");
  const { generateSignupCode, generateSignupSalt, hashCode, codeMatches, codeExpiresAt, isCodeExpired, EMAIL_CODE_TTL_MIN } = signupCodeMod;

  const code = generateSignupCode();
  expect(code).toMatch(/^\d{6}$/);
  const salt = generateSignupSalt();
  const hash = hashCode(code, salt);
  expect(codeMatches(code, salt, hash)).toBe(true);
  expect(codeMatches("000000" === code ? "111111" : "000000", salt, hash)).toBe(false);
  expect(codeMatches("12", salt, hash)).toBe(false);

  const now = Date.parse("2026-11-26T10:00:00Z");
  expect(isCodeExpired(codeExpiresAt(now), now)).toBe(false);
  expect(isCodeExpired(codeExpiresAt(now), now + (EMAIL_CODE_TTL_MIN + 1) * 60_000)).toBe(true);
  expect(isCodeExpired(null, now)).toBe(true);
});
