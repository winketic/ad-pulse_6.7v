export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
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
