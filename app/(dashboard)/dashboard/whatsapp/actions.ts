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
    .select("company_id")
    .eq("id", user.id)
    .single();

  if (!profile?.company_id) throw new Error("Компания не найдена");

  const service = createServiceClient();

  // Verify ownership
  const { data: msg } = await service
    .from("wazzup_messages")
    .select("id, parse_result")
    .eq("id", input.messageId)
    .eq("company_id", profile.company_id)
    .single();

  if (!msg) throw new Error("Сообщение не найдено");

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

  if (txError) throw new Error(txError.message);

  const updatedParseResult = {
    ...((msg.parse_result as Record<string, unknown>) ?? {}),
    transaction_created: true,
  };

  await service
    .from("wazzup_messages")
    .update({ parsed: true, needs_review: false, parse_result: updatedParseResult })
    .eq("id", input.messageId);

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
    .select("company_id")
    .eq("id", user.id)
    .single();

  if (!profile?.company_id) throw new Error("Компания не найдена");

  const service = createServiceClient();

  const { error } = await service
    .from("wazzup_messages")
    .update({ parsed: true, needs_review: false })
    .eq("id", messageId)
    .eq("company_id", profile.company_id);

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/whatsapp");
}
