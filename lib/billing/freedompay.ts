// Freedom Pay, Gateway Sync API (v3).
// Документация: https://docs.freedompay.kz/overview-643556m0
//
// Подпись: md5(метод;значения параметров по алфавиту через ; ;секретный ключ).
// Метод — последний сегмент пути запроса: "payment_page" для создания
// платёжной страницы, "fp-result" для колбэка (совпадает с последним
// сегментом pg_result_url).
//
// Живой платёж не проверен: у проекта пока нет мерчант-договора. Подпись
// проверена юнит-тестом на векторе из документации
// (payment;…;test_secret_key → b7ccbf6b20dc8125c70aa4e21617a2c0).

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { InvoiceRow } from "@/lib/billing/invoices";

const API_BASE = "https://api.freedompay.kz";
const METHOD_PAYMENT_PAGE = "payment_page";
export const RESULT_PATH = "/api/billing/fp-result";
export const RESULT_METHOD = "fp-result";

export function isFreedomPayConfigured(): boolean {
  return Boolean(process.env.FREEDOMPAY_MERCHANT_ID && process.env.FREEDOMPAY_SECRET_KEY);
}

export function pgSignature(
  method: string,
  params: Record<string, string>,
  secretKey: string,
): string {
  const values = Object.keys(params)
    .filter((key) => key !== "pg_sig")
    .sort()
    .map((key) => params[key]);
  return createHash("md5").update([method, ...values, secretKey].join(";")).digest("hex");
}

export function verifyPgSignature(
  method: string,
  fields: Record<string, string>,
  secretKey: string,
): boolean {
  const given = fields.pg_sig ?? "";
  if (!/^[0-9a-f]{32}$/i.test(given)) return false;
  const expected = pgSignature(method, fields, secretKey);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(given.toLowerCase(), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function parseXmlFields(xml: string): Record<string, string> {
  const fields: Record<string, string> = {};
  // Только листовые теги: значение не содержит "<". Иначе внешний <response>
  // съедал весь ответ и pg_status не находился.
  const re = /<\s*([a-zA-Z0-9_]+)\s*>([^<]*)<\/\s*\1\s*>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    fields[match[1]] = decodeXmlEntities(match[2].trim());
  }
  return fields;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://pulse.altaidynamics.kz").replace(/\/$/, "");
}

export type PaymentPageResult = { redirectUrl: string; paymentId: string | null };

/** Создаёт платёжную страницу Freedom Pay и возвращает ссылку для редиректа. */
export async function createPaymentPage(
  invoice: InvoiceRow,
  billingEmail: string | null,
): Promise<PaymentPageResult> {
  const merchantId = process.env.FREEDOMPAY_MERCHANT_ID;
  const secretKey = process.env.FREEDOMPAY_SECRET_KEY;
  if (!merchantId || !secretKey) throw new Error("Freedom Pay не настроен: нет FREEDOMPAY_MERCHANT_ID/SECRET_KEY");

  const params: Record<string, string> = {
    pg_merchant_id: merchantId,
    pg_order_id: invoice.number,
    pg_amount: invoice.amount.toFixed(2),
    pg_currency: "KZT",
    pg_description: `AD Pulse ${invoice.plan_code} (${invoice.billing_period})`,
    pg_salt: randomBytes(8).toString("hex"),
    pg_result_url: `${appUrl()}${RESULT_PATH}`,
    pg_success_url: `${appUrl()}/dashboard/billing?paid=1`,
    pg_failure_url: `${appUrl()}/dashboard/billing?failed=1`,
    pg_request_method: "POST",
    pg_testing_mode: process.env.FREEDOMPAY_TEST_MODE === "1" ? "1" : "0",
  };
  if (billingEmail) params.pg_user_contact_email = billingEmail;
  params.pg_sig = pgSignature(METHOD_PAYMENT_PAGE, params, secretKey);

  const body = new URLSearchParams(params).toString();
  const response = await fetch(`${API_BASE}/g2g/${METHOD_PAYMENT_PAGE}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  const xml = await response.text();
  const fields = parseXmlFields(xml);

  if (!response.ok || fields.pg_status !== "ok") {
    const detail = fields.pg_error_description
      ? `${fields.pg_error_code ?? "?"}: ${fields.pg_error_description}`
      : `HTTP ${response.status}`;
    throw new Error(`Freedom Pay отклонил платёж — ${detail}`);
  }

  if (fields.pg_sig && !verifyPgSignature(METHOD_PAYMENT_PAGE, fields, secretKey)) {
    throw new Error("Freedom Pay вернул ответ с неверной подписью");
  }
  if (!fields.pg_redirect_url) throw new Error("Freedom Pay не вернул ссылку на оплату");

  return { redirectUrl: fields.pg_redirect_url, paymentId: fields.pg_payment_id ?? null };
}

export type ResultCallback = {
  orderId: string;
  paymentId: string | null;
  amount: number;
  success: boolean;
};

/** Проверяет подпись и разбирает колбэк результата оплаты. */
export function parseResultCallback(fields: Record<string, string>): ResultCallback {
  const secretKey = process.env.FREEDOMPAY_SECRET_KEY;
  if (!secretKey) throw new Error("Freedom Pay не настроен: нет FREEDOMPAY_SECRET_KEY");
  if (!verifyPgSignature(RESULT_METHOD, fields, secretKey)) {
    throw new Error("Неверная подпись колбэка Freedom Pay");
  }

  const amount = Number.parseFloat(fields.pg_amount ?? "");
  if (!fields.pg_order_id || !Number.isFinite(amount)) {
    throw new Error("В колбэке нет номера заказа или суммы");
  }

  return {
    orderId: fields.pg_order_id,
    paymentId: fields.pg_payment_id ?? null,
    amount,
    success: fields.pg_result === "1",
  };
}
