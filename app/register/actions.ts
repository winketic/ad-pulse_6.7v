"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { sendEmail } from "@/lib/email";
import { sendTelegramMessage } from "@/lib/telegram/send";

const ADMIN_EMAIL = "altai.dx@gmail.com";

export async function submitRegistration(data: {
  company_name: string;
  contact_name: string;
  email: string;
  phone: string;
}) {
  const service = createServiceClient();

  const { data: reg, error } = await service
    .from("registrations")
    .insert({
      company_name: data.company_name.trim(),
      contact_name: data.contact_name.trim(),
      email: data.email.trim().toLowerCase(),
      phone: data.phone.trim() || null,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://ad-pulse-eight.vercel.app").replace(/\/$/, "");

  await sendTelegramMessage(
    "1700146125",
    `🆕 Новая заявка!\n\n` +
      `🏢 ${data.company_name}\n` +
      `👤 ${data.contact_name}\n` +
      `📧 ${data.email}\n` +
      `📱 ${data.phone || "—"}\n\n` +
      `<a href="${appUrl}/admin/registrations">👉 Открыть заявки</a>`
  );

  await sendEmail({
    to: ADMIN_EMAIL,
    subject: `Новая заявка — ${data.company_name}`,
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
        <span style="font-size:15px;font-weight:600;color:#111827;">${data.company_name}</span>
      </td></tr>
      <tr><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;">
        <span style="font-size:13px;color:#9ca3af;">Контактное лицо</span><br>
        <span style="font-size:15px;color:#111827;">${data.contact_name}</span>
      </td></tr>
      <tr><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;">
        <span style="font-size:13px;color:#9ca3af;">Email</span><br>
        <span style="font-size:15px;color:#111827;">${data.email}</span>
      </td></tr>
      <tr><td style="padding:10px 0;">
        <span style="font-size:13px;color:#9ca3af;">Телефон</span><br>
        <span style="font-size:15px;color:#111827;">${data.phone || "—"}</span>
      </td></tr>
    </table>
    <div style="margin-top:32px;text-align:center;">
      <a href="${appUrl}/admin/approve/${reg.id}"
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
