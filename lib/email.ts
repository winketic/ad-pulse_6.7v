/**
 * Resend отклоняет non-ASCII в поле from (422). В Vercel EMAIL_FROM пришёл
 * с кириллицей, поэтому отправляем только адрес без display name, а если
 * адрес сам не ASCII — безопасный onboarding@resend.dev.
 */
export function resolveEmailFrom(): string {
  const raw = (process.env.EMAIL_FROM ?? "").trim();
  const bracketed = raw.match(/<([^<>]+)>/);
  const address = (bracketed ? bracketed[1] : raw).trim();
  if (/^[^\s@<>]+@[^\s@<>]+$/.test(address) && /^[\x21-\x7E]+$/.test(address)) return address;
  return "onboarding@resend.dev";
}

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
    from: resolveEmailFrom(),
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
  const from = resolveEmailFrom();
  if (!apiKey) return { ok: false, message: "RESEND_API_KEY не задан", from };

  try {
    const res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    if (res.ok) {
      const payload = (await res.json().catch(() => ({}))) as { data?: { name?: string; status?: string }[] };
      const domains = (payload.data ?? [])
        .filter((domain) => domain.name)
        .map((domain) => `${domain.name}: ${domain.status ?? "?"}`);
      return {
        ok: true,
        message: domains.length > 0 ? `ключ принят, домены — ${domains.join(", ")}` : "ключ принят, домены не добавлены",
        from,
      };
    }
    const body = await res.text().catch(() => "");
    return { ok: false, message: `Resend ${res.status}: ${body.slice(0, 200)}`, from };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "нет связи с Resend", from };
  }
}
