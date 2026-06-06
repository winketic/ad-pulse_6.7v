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

  console.log("[email] RESEND_API_KEY exists:", !!apiKey);
  console.log("[email] EMAIL_FROM:", process.env.EMAIL_FROM);
  console.log("[email] Sending email to:", to);

  if (!apiKey) {
    console.log("[email] RESEND_API_KEY not set — skipping send");
    return;
  }

  const payload = {
    from: "onboarding@resend.dev",
    to: [to],
    subject,
    html,
  };

  console.log("[email] Resend payload:", JSON.stringify({ ...payload, html: "[omitted]" }));

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const result = await res.json().catch(() => res.text());
  console.log("[email] Resend result:", JSON.stringify(result));

  if (!res.ok) {
    console.error(`[email] Resend error [${res.status}]:`, JSON.stringify(result));
  }
}
