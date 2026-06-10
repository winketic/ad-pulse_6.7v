import { createServiceClient } from "@/lib/supabase/service";
import { sendEmail } from "@/lib/email";

const APP_URL = (
  process.env.NEXT_PUBLIC_APP_URL ?? "https://ad-pulse-eight.vercel.app"
).replace(/\/$/, "");

/**
 * Creates a user (if they don't exist) via generateLink, then sends
 * the invite email through Resend instead of Supabase built-in SMTP.
 *
 * Returns userId and whether the email was sent successfully.
 */
export async function createInviteAndSendEmail(
  email: string
): Promise<{ userId: string; emailSent: boolean }> {
  const svc = createServiceClient();

  // generateLink creates the user if they don't exist and gives us hashed_token
  const { data: linkData, error: linkErr } = await svc.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo: `${APP_URL}/invite` },
  });

  let userId: string;
  let hashedToken: string | undefined;

  if (linkErr) {
    console.error("[invite] generateLink error:", linkErr.message);

    const isAlreadyExists =
      linkErr.message.toLowerCase().includes("already registered") ||
      linkErr.message.toLowerCase().includes("already in use") ||
      linkErr.message.toLowerCase().includes("already exists") ||
      linkErr.status === 422;

    if (!isAlreadyExists) {
      throw new Error(`Ошибка создания пользователя: ${linkErr.message}`);
    }

    // User exists — find them, no new invite link
    const { data: authList } = await svc.auth.admin.listUsers({ perPage: 1000 });
    const found = (authList?.users ?? []).find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );
    if (!found) throw new Error("Пользователь не найден в системе");
    userId = found.id;
    hashedToken = undefined;
  } else {
    if (!linkData?.user?.id) throw new Error("Не удалось получить ID пользователя");
    userId = linkData.user.id;
    hashedToken = linkData.properties?.hashed_token;
  }

  // Send via Resend (only if we have a fresh token)
  let emailSent = false;
  if (hashedToken) {
    const confirmUrl = `${APP_URL}/auth/confirm?token_hash=${hashedToken}&type=invite`;
    try {
      await sendEmail({
        to: email,
        subject: "Приглашение в AD Pulse",
        html: buildInviteHtml(confirmUrl),
      });
      emailSent = true;
      console.log("[invite] Email sent via Resend to", email);
    } catch (e) {
      console.error("[invite] Resend send failed:", e);
    }
  }

  return { userId, emailSent };
}

function buildInviteHtml(link: string): string {
  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:560px;margin:0 auto;padding:40px 24px;color:#111827;">
  <h1 style="font-size:22px;font-weight:700;color:#05050a;margin:0 0 4px;">AD Pulse</h1>
  <p style="font-size:13px;color:#9ca3af;margin:0 0 32px;">Система учёта материалов</p>

  <h2 style="font-size:18px;font-weight:600;margin:0 0 12px;">Вас пригласили в AD Pulse</h2>
  <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 28px;">
    Нажмите на кнопку ниже, чтобы принять приглашение и установить пароль для входа в систему.
  </p>

  <a href="${link}"
     style="display:inline-block;background:#1a472a;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:10px;font-size:15px;font-weight:600;">
    Принять приглашение →
  </a>

  <p style="font-size:13px;color:#9ca3af;margin-top:32px;line-height:1.5;">
    Ссылка действительна 24 часа.<br>
    Если вы не ожидали это письмо — просто проигнорируйте его.
  </p>
</div>`.trim();
}
