"use server";

import { submitSupportRequest, type SupportResult } from "@/lib/support/submit";

export async function sendPublicSupportMessage(form: {
  name: string;
  email: string;
  subject: string;
  message: string;
  website?: string;
}): Promise<SupportResult> {
  // Скрытое поле-ловушка: боты заполняют всё подряд. Им отвечаем «успехом»,
  // письмо не отправляем.
  if (form?.website && form.website.trim() !== "") {
    return { id: "ignored", emailSent: false };
  }

  return submitSupportRequest({
    name: form?.name ?? null,
    email: form?.email,
    subject: form?.subject,
    message: form?.message,
    source: "public",
  });
}
