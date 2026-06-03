import { createServiceClient } from "@/lib/supabase/service";
import { parseMessage } from "./parser";

export async function parseAndSave(messageId: string): Promise<void> {
  const service = createServiceClient();

  const { data: msg } = await service
    .from("wazzup_messages")
    .select("id, raw_text, company_id")
    .eq("id", messageId)
    .single();

  if (!msg) return;

  const result = await parseMessage(msg.raw_text ?? "", msg.company_id);

  const allFound = !!(result.type && result.quantity != null && result.material_id);
  const autoCreate = result.confidence === "high" && allFound;

  let transactionCreated = false;

  if (autoCreate) {
    const { error } = await service.from("material_transactions").insert({
      company_id: msg.company_id,
      material_id: result.material_id!,
      type: result.type!,
      quantity: result.quantity!,
      transaction_date: new Date().toISOString().split("T")[0],
      source: "whatsapp",
      wazzup_message_id: messageId,
    });
    if (!error) transactionCreated = true;
  }

  await service
    .from("wazzup_messages")
    .update({
      parsed: true,
      needs_review: !autoCreate,
      parse_result: { ...result, transaction_created: transactionCreated },
    })
    .eq("id", messageId);
}
