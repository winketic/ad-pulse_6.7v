// Создание компании при self-serve регистрации: профиль админа + 30-дневный
// пилот. Вся запись — в одной RPC (миграция 059), поэтому повторный вызов
// после перезагрузки страницы не создаёт вторую компанию.

import { createServiceClient } from "@/lib/supabase/service";
import { sendTelegramMessage } from "@/lib/telegram/send";
import { sendEmail } from "@/lib/email";
import { PLATFORM_OWNER_EMAIL } from "@/lib/auth/platform-owner";
import { escapeHtml } from "@/lib/utils/escapeHtml";

export type ProvisionResult = {
  companyId: string;
  created: boolean;
  trialEndsAt: string | null;
};

export async function provisionSignedUpUser(params: {
  userId: string;
  email: string;
  companyName: string;
  contactName: string;
  phone?: string | null;
}): Promise<ProvisionResult> {
  const service = createServiceClient();

  const { data: existing, error: profileError } = await service
    .from("profiles")
    .select("company_id")
    .eq("id", params.userId)
    .maybeSingle();
  if (profileError) throw new Error(`Не удалось проверить профиль: ${profileError.message}`);

  if (existing?.company_id) {
    const { data: subscription } = await service
      .from("subscriptions")
      .select("trial_ends_at")
      .eq("company_id", existing.company_id)
      .maybeSingle();
    return {
      companyId: existing.company_id,
      created: false,
      trialEndsAt: subscription?.trial_ends_at ?? null,
    };
  }

  let companyId: string | null = null;
  const { data: rpcCompanyId, error } = await service.rpc("billing_provision_signup", {
    p_user_id: params.userId,
    p_company_name: params.companyName,
    p_full_name: params.contactName,
    p_billing_email: params.email,
  });

  if (error) {
    const missingFunction = error.code === "PGRST202" || /could not find the function|schema cache/i.test(error.message);
    if (!missingFunction) throw new Error(`Не удалось создать компанию: ${error.message}`);

    // Окно до применения миграции 059: регистрация не должна падать.
    // Создаём компанию и профиль без строки подписки — биллинг-гейт для неё
    // fail-open, пилот подключится после миграции.
    console.warn("[provision] billing_provision_signup недоступна — создаю компанию без пилота");
    const { data: company, error: companyError } = await service
      .from("companies")
      .insert({ name: params.companyName.slice(0, 160) })
      .select("id")
      .single();
    if (companyError || !company) throw new Error(`Не удалось создать компанию: ${companyError?.message ?? "нет ответа"}`);

    const { error: profileInsertError } = await service.from("profiles").insert({
      id: params.userId,
      company_id: company.id,
      role: "admin",
      full_name: (params.contactName || params.email).slice(0, 120),
    });
    if (profileInsertError) {
      await service.from("companies").delete().eq("id", company.id);
      throw new Error(`Не удалось создать профиль: ${profileInsertError.message}`);
    }
    companyId = company.id;
  } else {
    companyId = rpcCompanyId as string | null;
  }

  if (!companyId) throw new Error("Не удалось создать компанию: пустой ответ");

  const { data: subscription } = await service
    .from("subscriptions")
    .select("trial_ends_at")
    .eq("company_id", companyId)
    .maybeSingle();

  // Журнал заявок остаётся: по нему видно, откуда пришёл клиент.
  const { error: logError } = await service.from("registrations").insert({
    company_name: params.companyName,
    contact_name: params.contactName,
    email: params.email,
    phone: params.phone?.trim() || null,
    status: "auto",
  });
  if (logError) console.error("[provision] registration log failed:", logError.message);

  await notifyOwner(params).catch((notifyError) =>
    console.error("[provision] owner notification failed:", notifyError),
  );

  return {
    companyId,
    created: true,
    trialEndsAt: subscription?.trial_ends_at ?? null,
  };
}

async function notifyOwner(params: {
  email: string;
  companyName: string;
  contactName: string;
  phone?: string | null;
}): Promise<void> {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://pulse.altaidynamics.kz").replace(/\/$/, "");

  await sendTelegramMessage(
    "1700146125",
    `🚀 Новый клиент сам зарегистрировался\n\n` +
      `🏢 ${escapeHtml(params.companyName)}\n` +
      `👤 ${escapeHtml(params.contactName)}\n` +
      `📧 ${escapeHtml(params.email)}\n` +
      `📱 ${escapeHtml(params.phone || "—")}\n\n` +
      `<a href="${appUrl}/admin/platform">👉 Компании</a>`,
  );

  await sendEmail({
    to: PLATFORM_OWNER_EMAIL,
    subject: `Новый клиент: ${params.companyName}`.slice(0, 160),
    html: `<p>Компания <b>${escapeHtml(params.companyName)}</b> зарегистрировалась сама, пилот 30 дней.</p>
<p>${escapeHtml(params.contactName)} · ${escapeHtml(params.email)} · ${escapeHtml(params.phone || "—")}</p>
<p><a href="${appUrl}/admin/platform">Открыть платформу</a></p>`,
  });
}
