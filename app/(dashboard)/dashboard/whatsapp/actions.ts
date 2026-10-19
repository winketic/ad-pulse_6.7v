"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export type TxType = "income" | "expense" | "defect" | "return";

export type ConfirmInput = {
  messageId: string;
  materialId: string;
  type: TxType;
  quantity: number;
};

export async function confirmWhatsAppTransaction(input: ConfirmInput) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Не авторизован");

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id, role")
    .eq("id", user.id)
    .single();

  if (!profile?.company_id) throw new Error("Компания не найдена");
  if (profile.role !== "admin" && profile.role !== "manager") throw new Error("Нет прав на обработку сообщений");
  if (!Number.isFinite(input.quantity) || input.quantity <= 0 || input.quantity > 999999999) {
    throw new Error("Некорректное количество");
  }
  if (!["income", "expense", "defect", "return"].includes(input.type)) throw new Error("Неизвестный тип операции");

  const service = createServiceClient();

  // Verify ownership
  const { data: msg } = await service
    .from("wazzup_messages")
    .select("id, parse_result, parsed, needs_review")
    .eq("id", input.messageId)
    .eq("company_id", profile.company_id)
    .single();

  if (!msg) throw new Error("Сообщение не найдено");
  if (!msg.parsed || !msg.needs_review) throw new Error("Сообщение уже обработано");

  // Verify the chosen material actually belongs to this company — otherwise
  // a crafted materialId could write a cross-tenant transaction row.
  const { data: material } = await service
    .from("materials")
    .select("id, name, unit, kg_per_meter")
    .eq("id", input.materialId)
    .eq("company_id", profile.company_id)
    .maybeSingle();

  if (!material) throw new Error("Материал не найден");
  if (material.unit.toLowerCase() === "шт" && !(material.kg_per_meter && Number(material.kg_per_meter) > 0) && !Number.isInteger(input.quantity)) {
    throw new Error("Количество в штуках должно быть целым");
  }

  // Claim the review row atomically so concurrent/repeated confirmation calls
  // cannot create duplicate transactions through the service-role client.
  const { data: claimed, error: claimError } = await service
    .from("wazzup_messages")
    .update({ needs_review: false })
    .eq("id", input.messageId)
    .eq("company_id", profile.company_id)
    .eq("parsed", true)
    .eq("needs_review", true)
    .select("id")
    .maybeSingle();
  if (claimError) throw new Error(claimError.message);
  if (!claimed) throw new Error("Сообщение уже обработано");

  const { error: txError } = await service.from("material_transactions").insert({
    company_id: profile.company_id,
    material_id: input.materialId,
    type: input.type,
    quantity: input.quantity,
    transaction_date: new Date().toISOString().split("T")[0],
    created_by: user.id,
    source: "whatsapp",
    wazzup_message_id: input.messageId,
  });

  if (txError) {
    await service.from("wazzup_messages")
      .update({ needs_review: true })
      .eq("id", input.messageId)
      .eq("company_id", profile.company_id)
      .eq("parsed", true)
      .eq("needs_review", false);
    throw new Error(txError.message);
  }

  const updatedParseResult = {
    ...((msg.parse_result as Record<string, unknown>) ?? {}),
    transaction_created: true,
  };

  const { error: messageError } = await service
    .from("wazzup_messages")
    .update({ parse_result: updatedParseResult })
    .eq("id", input.messageId)
    .eq("company_id", profile.company_id);
  if (messageError) console.error("[confirmWhatsAppTransaction] transaction saved; parse_result update failed:", messageError.message);

  revalidatePath("/dashboard/whatsapp");
  revalidatePath("/dashboard/transactions");
  revalidatePath("/dashboard");
}

export async function rejectWhatsAppMessage(messageId: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Не авторизован");

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id, role")
    .eq("id", user.id)
    .single();

  if (!profile?.company_id) throw new Error("Компания не найдена");
  if (profile.role !== "admin" && profile.role !== "manager") throw new Error("Нет прав на обработку сообщений");

  const service = createServiceClient();

  const { data, error } = await service
    .from("wazzup_messages")
    .update({ parsed: true, needs_review: false })
    .eq("id", messageId)
    .eq("company_id", profile.company_id)
    .eq("parsed", true)
    .eq("needs_review", true)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Сообщение уже обработано или не найдено");

  revalidatePath("/dashboard/whatsapp");
}
