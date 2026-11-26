export async function sendEmail({
  to,
  subject,
  html,
  replyTo,
}: {
  to: string;
  subject: string;
  html: string;
  /** Куда отвечать получателю письма (поддержка, счета). */
  replyTo?: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    // Бросаем, а не возвращаемся молча: иначе вызывающий код считает, что
    // письмо ушло, и пользователь видит «приглашение отправлено» при пустом
    // почтовом ящике. Именно так баг жил месяцами незамеченным.
    throw new Error("RESEND_API_KEY не задан — письмо не отправлено");
  }

  const payload = {
    from: process.env.EMAIL_FROM ?? "noreply@altaidynamics.kz",
    to: [to],
    subject,
    html,
    ...(replyTo ? { reply_to: replyTo } : {}),
  };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const result = await res.json().catch(() => res.text());

  if (!res.ok) {
    const detail =
      typeof result === "object" && result && "message" in result
        ? String((result as { message: unknown }).message)
        : JSON.stringify(result);
    console.error(`[email] Resend error [${res.status}]:`, detail);
    throw new Error(`Resend [${res.status}]: ${detail}`);
  }
}

/** Диагностика для админки: принят ли ключ Resend и какой адрес отправителя. */
export async function checkEmailStatus(): Promise<{ ok: boolean; message: string; from: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "noreply@altaidynamics.kz";
  if (!apiKey) return { ok: false, message: "RESEND_API_KEY не задан", from };

  try {
    const res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    if (res.ok) return { ok: true, message: "ключ принят", from };
    const body = await res.text().catch(() => "");
    return { ok: false, message: `Resend ${res.status}: ${body.slice(0, 200)}`, from };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "нет связи с Resend", from };
  }
}
