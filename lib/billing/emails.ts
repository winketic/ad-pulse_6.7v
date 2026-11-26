// Письма биллинга и безопасности. Отправка через Resend (lib/email.ts).
// Ошибку отправки вызывающий код решает сам: счёт уже создан в базе,
// и потеря письма не должна отменять оплату.

import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/utils/escapeHtml";
import { formatTenge, planFeatures, type PlanOffer } from "@/lib/billing/plans";
import type { InvoiceRow } from "@/lib/billing/invoices";

function layout(params: { title: string; body: string; footer?: string }): string {
  return `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
<tr><td align="center">
<table width="100%" style="max-width:560px;">
  <tr><td style="padding-bottom:20px;">
    <span style="color:#2563eb;font-size:18px;font-weight:700;">AD Pulse</span>
  </td></tr>
  <tr><td style="background:#ffffff;border-radius:14px;padding:28px;">
    <h2 style="margin:0 0 16px;font-size:19px;color:#111827;">${params.title}</h2>
    ${params.body}
    ${params.footer ? `<p style="margin:24px 0 0;font-size:12px;color:#9ca3af;">${params.footer}</p>` : ""}
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://pulse.altaidynamics.kz").replace(/\/$/, "");
}

function requisites(): string {
  const name = process.env.BILLING_LEGAL_NAME;
  const bin = process.env.BILLING_BIN;
  const iban = process.env.BILLING_IBAN;
  const bank = process.env.BILLING_BANK;
  if (!name && !bin && !iban && !bank) return "";

  const rows = [
    name ? `Получатель: ${escapeHtml(name)}` : "",
    bin ? `БИН/ИИН: ${escapeHtml(bin)}` : "",
    iban ? `IBAN: ${escapeHtml(iban)}` : "",
    bank ? `Банк: ${escapeHtml(bank)}` : "",
  ].filter(Boolean);

  return `<div style="margin-top:18px;padding:14px;background:#f9fafb;border-radius:10px;font-size:13px;color:#374151;line-height:1.7;">
    ${rows.join("<br>")}
  </div>`;
}

export async function sendInvoiceEmail(params: {
  to: string;
  invoice: InvoiceRow;
  offer: PlanOffer;
}): Promise<void> {
  const { to, invoice, offer } = params;
  const period = invoice.billing_period === "yearly" ? "год" : "месяц";
  const features = planFeatures(invoice.plan_code);
  const featuresHtml = features.length
    ? `<ul style="margin:14px 0 0;padding-left:18px;font-size:13px;color:#374151;line-height:1.7;">${features.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : "";
  const payLink = invoice.payment_url
    ? `<p style="margin:20px 0;"><a href="${invoice.payment_url}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">Оплатить картой</a></p>`
    : "";

  await sendEmail({
    to,
    subject: `Счёт ${invoice.number} на ${formatTenge(invoice.amount)} — AD Pulse`,
    html: layout({
      title: `Счёт ${escapeHtml(invoice.number)}`,
      body: `<p style="margin:0 0 8px;font-size:14px;color:#374151;">
        Тариф «${escapeHtml(offer.name)}», оплата за ${period}. Сумма: <b>${formatTenge(invoice.amount)}</b>.
      </p>
      <p style="margin:0;font-size:13px;color:#6b7280;">
        Действует до ${invoice.due_at ? new Date(invoice.due_at).toLocaleDateString("ru-RU") : "—"}.
        После оплаты подписка активируется автоматически.
      </p>
      ${featuresHtml}
      ${payLink}
      ${requisites()}
      <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">
        Счёт и история платежей — в разделе «Оплата»: <a href="${appUrl()}/dashboard/billing" style="color:#2563eb;">${appUrl()}/dashboard/billing</a>
      </p>`,
      footer: "Если оплата уже прошла, письмо можно игнорировать.",
    }),
  });
}

export async function sendPaymentReceivedEmail(params: {
  to: string;
  invoice: InvoiceRow;
  offer: PlanOffer;
  periodEnd: string | null;
}): Promise<void> {
  const { to, invoice, offer, periodEnd } = params;
  await sendEmail({
    to,
    subject: `Оплата получена — ${escapeHtml(offer.name)} активен`,
    html: layout({
      title: "Оплата получена",
      body: `<p style="margin:0 0 10px;font-size:14px;color:#374151;">
        Счёт ${escapeHtml(invoice.number)} на ${formatTenge(invoice.amount)} оплачен.
        Тариф «${escapeHtml(offer.name)}» активен${periodEnd ? ` до ${new Date(periodEnd).toLocaleDateString("ru-RU")}` : ""}.
      </p>
      <p style="margin:0;font-size:13px;color:#6b7280;">Все функции и данные остаются на месте. Спасибо.</p>`,
      footer: "Вопросы по счёту — ответом на это письмо.",
    }),
  });
}

export async function sendTrialEndingEmail(params: {
  to: string;
  daysLeft: number;
  periodEnd: string | null;
}): Promise<void> {
  const { to, daysLeft, periodEnd } = params;
  const when = daysLeft <= 0 ? "сегодня" : `через ${daysLeft} дн.`;
  await sendEmail({
    to,
    subject: `Пилот заканчивается ${when} — AD Pulse`,
    html: layout({
      title: `Пилот заканчивается ${when}`,
      body: `<p style="margin:0 0 10px;font-size:14px;color:#374151;">
        Бесплатный период ${periodEnd ? `до ${new Date(periodEnd).toLocaleDateString("ru-RU")}` : ""}.
        Чтобы учёт материалов продолжился без остановки, выберите тариф.
      </p>
      <p style="margin:18px 0 0;">
        <a href="${appUrl()}/dashboard/billing" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">Выбрать тариф</a>
      </p>
      <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">
        После окончания периода данные остаются доступны для чтения, ввод блокируется через 7 дней.
      </p>`,
      footer: "Это письмо отправлено автоматически.",
    }),
  });
}

export async function sendPaymentOverdueEmail(params: {
  to: string;
  invoice: InvoiceRow;
  offer: PlanOffer;
}): Promise<void> {
  const { to, invoice, offer } = params;
  await sendEmail({
    to,
    subject: `Оплата счёта ${escapeHtml(invoice.number)} просрочена — AD Pulse`,
    html: layout({
      title: "Счёт ждёт оплаты",
      body: `<p style="margin:0 0 10px;font-size:14px;color:#374151;">
        Счёт ${escapeHtml(invoice.number)} на ${formatTenge(invoice.amount)} (тариф «${escapeHtml(offer.name)}») не оплачен.
        Доступ к вводу данных сохраняется ещё 7 дней после окончания периода.
      </p>
      <p style="margin:18px 0 0;">
        <a href="${appUrl()}/dashboard/billing" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">Перейти к оплате</a>
      </p>`,
    }),
  });
}

export async function sendNewDeviceEmail(params: {
  to: string;
  ip: string | null;
  userAgent: string | null;
  at: Date;
}): Promise<void> {
  const { to, ip, userAgent, at } = params;
  const landingUrl = (process.env.NEXT_PUBLIC_LANDING_URL ?? "https://altaidynamics.kz").replace(/\/$/, "");
  await sendEmail({
    to,
    subject: "Новый вход в AD Pulse",
    html: layout({
      title: "Вход с нового устройства",
      body: `<p style="margin:0 0 10px;font-size:14px;color:#374151;">
        ${at.toLocaleString("ru-RU", { timeZone: "Asia/Almaty" })} выполнен вход в аккаунт.
      </p>
      <p style="margin:0;font-size:13px;color:#6b7280;">
        IP: ${escapeHtml(ip ?? "не определён")}<br>
        Устройство: ${escapeHtml((userAgent ?? "не определено").slice(0, 180))}
      </p>
      <p style="margin:18px 0 0;">
        <a href="${landingUrl}/security" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600;">
          Проверить безопасность аккаунта
        </a>
      </p>
      <p style="margin:14px 0 0;font-size:13px;color:#374151;">
        На странице можно сменить пароль, посмотреть устройства и написать в поддержку.
      </p>`,
    }),
  });
}

export async function sendSupportRequestEmail(params: {
  to: string;
  fromEmail: string;
  fromName: string | null;
  companyName: string | null;
  subject: string;
  message: string;
  source: "dashboard" | "public";
}): Promise<void> {
  const { to, fromEmail, fromName, companyName, subject, message } = params;
  await sendEmail({
    to,
    subject: `Поддержка: ${subject}`.slice(0, 180),
    replyTo: fromEmail,
    html: layout({
      title: "Новое обращение в поддержку",
      body: `<p style="margin:0 0 8px;font-size:13px;color:#6b7280;">
        ${escapeHtml(fromName ?? "Без имени")}${companyName ? ` · ${escapeHtml(companyName)}` : ""}<br>
        ${escapeHtml(fromEmail)}
      </p>
      <p style="margin:12px 0 4px;font-size:13px;color:#6b7280;">Тема: ${escapeHtml(subject)}</p>
      <div style="margin-top:8px;padding:14px;background:#f9fafb;border-radius:10px;font-size:14px;color:#111827;white-space:pre-wrap;">${escapeHtml(message)}</div>`,
      footer: "Ответьте на это письмо — ответ уйдёт автору обращения.",
    }),
  });
}

export async function sendSignupCodeEmail(params: { to: string; code: string }): Promise<void> {
  const { to, code } = params;
  await sendEmail({
    to,
    subject: `Код подтверждения AD Pulse: ${code}`,
    html: layout({
      title: "Подтвердите почту",
      body: `<p style="margin:0 0 12px;font-size:14px;color:#374151;">
        Код для завершения регистрации:
      </p>
      <p style="margin:0 0 16px;font-size:30px;letter-spacing:8px;font-weight:700;color:#111827;">${code}</p>
      <p style="margin:0;font-size:13px;color:#6b7280;">
        Код действует 15 минут. Если вы не регистрировались в AD Pulse, просто удалите письмо.
      </p>`,
      footer: "Письмо отправлено автоматически.",
    }),
  });
}

export async function sendPasswordResetCodeEmail(params: { to: string; code: string }): Promise<void> {
  const { to, code } = params;
  await sendEmail({
    to,
    subject: `Сброс пароля AD Pulse: ${code}`,
    html: layout({
      title: "Сброс пароля",
      body: `<p style="margin:0 0 12px;font-size:14px;color:#374151;">
        Код для нового пароля:
      </p>
      <p style="margin:0 0 16px;font-size:30px;letter-spacing:8px;font-weight:700;color:#111827;">${code}</p>
      <p style="margin:0;font-size:13px;color:#6b7280;">
        Код действует 15 минут. Если вы не просили сброс, пароль останется прежним.
      </p>`,
      footer: "Письмо отправлено автоматически.",
    }),
  });
}
