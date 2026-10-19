"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { sendEmail } from "@/lib/email";
import { sendTelegramMessage } from "@/lib/telegram/send";
import { PLATFORM_OWNER_EMAIL } from "@/lib/auth/platform-owner";
import { escapeHtml } from "@/lib/utils/escapeHtml";


export async function submitRegistration(data: {
  company_name: string;
  contact_name: string;
  email: string;
  phone: string;
}) {
  const companyName = typeof data?.company_name === "string" ? data.company_name.trim() : "";
  const contactName = typeof data?.contact_name === "string" ? data.contact_name.trim() : "";
  const email = typeof data?.email === "string" ? data.email.trim().toLowerCase() : "";
  const phone = typeof data?.phone === "string" ? data.phone.trim() : "";
  if (!companyName || companyName.length > 160) throw new Error("Укажите название компании (до 160 символов)");
  if (!contactName || contactName.length > 120) throw new Error("Укажите имя контактного лица (до 120 символов)");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error("Укажите корректный email");
  if (phone.length > 40) throw new Error("Телефон слишком длинный");

  const service = createServiceClient();

  const { data: reg, error } = await service
    .from("registrations")
    .insert({
      company_name: companyName,
      contact_name: contactName,
      email,
      phone: phone || null,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://ad-pulse-eight.vercel.app").replace(/\/$/, "");

  await sendTelegramMessage(
    "1700146125",
    `🆕 Новая заявка!\n\n` +
      `🏢 ${escapeHtml(companyName)}\n` +
      `👤 ${escapeHtml(contactName)}\n` +
      `📧 ${escapeHtml(email)}\n` +
      `📱 ${escapeHtml(phone || "—")}\n\n` +
      `<a href="${appUrl}/admin/registrations">👉 Открыть заявки</a>`
  ).catch((e) => console.error("[submitRegistration] Telegram alert failed:", e));

  // Заявка уже сохранена и Telegram-алерт ушёл: сбой письма админу не должен
  // показывать клиенту ошибку — иначе он отправит заявку повторно.
  await sendAdminEmail({ company_name: companyName, contact_name: contactName, email, phone }, appUrl, reg.id).catch((e) =>
    console.error("[submitRegistration] admin email failed:", e)
  );
}

function sendAdminEmail(
  data: { company_name: string; contact_name: string; email: string; phone: string },
  appUrl: string,
  registrationId: string,
): Promise<void> {
  const company = escapeHtml(data.company_name);
  const contact = escapeHtml(data.contact_name);
  const email = escapeHtml(data.email);
  const phone = escapeHtml(data.phone || "—");
  return sendEmail({
    to: PLATFORM_OWNER_EMAIL,
    subject: `Новая заявка — ${data.company_name.replace(/[\r\n]/g, " ").slice(0, 120)}`,
    html: `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
<tr><td align="center">
<table width="100%" style="max-width:560px;">
  <tr><td align="center" style="padding-bottom:24px;">
    <div style="background:#05050a;border-radius:16px;padding:14px 20px;display:inline-block;">
      <span style="color:#00f5c4;font-size:20px;font-weight:700;">AD Pulse</span>
    </div>
  </td></tr>
  <tr><td style="background:#fff;border-radius:16px;padding:40px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
    <h2 style="margin:0 0 24px;font-size:20px;color:#111827;">🏢 Новая заявка на подключение</h2>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;">
        <span style="font-size:13px;color:#9ca3af;">Компания</span><br>
        <span style="font-size:15px;font-weight:600;color:#111827;">${company}</span>
      </td></tr>
      <tr><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;">
        <span style="font-size:13px;color:#9ca3af;">Контактное лицо</span><br>
        <span style="font-size:15px;color:#111827;">${contact}</span>
      </td></tr>
      <tr><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;">
        <span style="font-size:13px;color:#9ca3af;">Email</span><br>
        <span style="font-size:15px;color:#111827;">${email}</span>
      </td></tr>
      <tr><td style="padding:10px 0;">
        <span style="font-size:13px;color:#9ca3af;">Телефон</span><br>
        <span style="font-size:15px;color:#111827;">${phone}</span>
      </td></tr>
    </table>
    <div style="margin-top:32px;text-align:center;">
      <a href="${appUrl}/admin/approve/${registrationId}"
         style="display:inline-block;background:#05050a;color:#00f5c4;font-size:15px;font-weight:600;text-decoration:none;padding:14px 36px;border-radius:10px;">
        ✓ Одобрить
      </a>
    </div>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`,
  });
}
