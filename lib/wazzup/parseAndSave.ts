import { createServiceClient } from "@/lib/supabase/service";
import { parseMessage } from "./parser";
import { transcribeVoice } from "./transcribeVoice";
import { parseImageTransaction } from "./parseImage";
import { sendTelegramAlert } from "@/lib/telegram/send";
import { ensureFreshToken } from "./refreshToken";

function convertUnits(qty: number, from: string, to: string): number | null {
  const f = from.toLowerCase().trim();
  const t = to.toLowerCase().trim();
  if (f === t) return qty;
  if ((f === "тонна" || f === "т") && t === "кг") return qty * 1000;
  if (f === "кг" && (t === "тонна" || t === "т"))  return qty / 1000;
  if (f === "кг"  && t === "г")                     return qty * 1000;
  if (f === "г"   && t === "кг")                    return qty / 1000;
  if ((f === "м3" || f === "куб") && t === "литр")  return qty * 1000;
  if (f === "литр" && (t === "м3" || t === "куб"))  return qty / 1000;
  return null; // unknown pair → needs_review
}

export async function parseAndSave(messageId: string): Promise<void> {
  const service = createServiceClient();

  const { data: msg, error: msgErr } = await service
    .from("wazzup_messages")
    .select("id, raw_text, company_id, content_type, media_url, chat_id")
    .eq("id", messageId)
    .single();

  if (msgErr) console.error(`[parseAndSave] fetch error for id=${messageId}: ${msgErr.message}`);
  if (!msg) return;

  let textToParse: string = msg.raw_text ?? "";

  const needsMedia =
    (msg.content_type === "voice" || msg.content_type === "image") &&
    !!msg.media_url;

  if (needsMedia) {
    let accessToken = "";
    try {
      accessToken = await ensureFreshToken(msg.company_id);
    } catch (e) {
      console.error("[parseAndSave] token refresh error:", e);
    }

    if (accessToken) {
      if (msg.content_type === "voice") {
        try {
          const transcription = await transcribeVoice(msg.media_url!, accessToken);
          if (transcription) {
            textToParse = transcription;
            await service
              .from("wazzup_messages")
              .update({ raw_text: transcription })
              .eq("id", messageId);
          }
        } catch (err) {
          console.error("[parseAndSave] voice transcription error:", err);
        }
      } else if (msg.content_type === "image") {
        try {
          const extracted = await parseImageTransaction(msg.media_url!, accessToken);
          if (extracted && extracted !== "не удалось распознать") {
            textToParse = extracted;
            await service
              .from("wazzup_messages")
              .update({ raw_text: extracted })
              .eq("id", messageId);
          }
        } catch (err) {
          console.error("[parseAndSave] image parsing error:", err);
        }
      }
    }
  }

  // Fetch conversation context (last 5 messages from same chat)
  let context: string[] = [];
  if (msg.chat_id) {
    const { data: prevMsgs } = await service
      .from("wazzup_messages")
      .select("raw_text")
      .eq("company_id", msg.company_id)
      .eq("chat_id", msg.chat_id)
      .neq("id", messageId)
      .not("raw_text", "is", null)
      .order("created_at", { ascending: false })
      .limit(5);
    context = (prevMsgs ?? [])
      .map((m) => m.raw_text as string)
      .filter(Boolean)
      .reverse(); // chronological order
  }

  const result = await parseMessage(textToParse, msg.company_id, context);

  const allFound = !!(result.type && result.quantity != null && result.material_id);

  // Unit conversion: GPT may return "тонна" while material.unit is "кг"
  let finalQuantity = result.quantity ?? 0;
  let unitMismatch = false;
  if (allFound) {
    const { data: matInfo } = await service
      .from("materials")
      .select("unit")
      .eq("id", result.material_id!)
      .single();
    const matUnit = matInfo?.unit ?? null;
    const gptUnit = result.unit ?? null;
    if (matUnit && gptUnit && matUnit.toLowerCase() !== gptUnit.toLowerCase()) {
      const converted = convertUnits(finalQuantity, gptUnit, matUnit);
      if (converted !== null) {
        finalQuantity = converted;
      } else {
        console.warn(`[parseAndSave] unknown unit conversion: ${gptUnit} → ${matUnit}, setting needs_review`);
        unitMismatch = true;
      }
    }
  }

  const autoCreate = result.confidence === "high" && allFound && !unitMismatch;
  // Only flag for review if SOMETHING was found but incomplete — not for irrelevant messages
  const hasAnyField = !!(result.type || result.material_id || result.quantity != null);
  const needsReview = (!autoCreate && hasAnyField) || unitMismatch;

  let transactionCreated = false;

  if (autoCreate) {
    const { error } = await service.from("material_transactions").insert({
      company_id: msg.company_id,
      material_id: result.material_id!,
      type: result.type!,
      quantity: finalQuantity,
      note: result.note ?? null,
      transaction_date: new Date().toISOString().split("T")[0],
      source: "whatsapp",
      wazzup_message_id: messageId,
    });

    if (!error) {
      transactionCreated = true;
      // Fire-and-forget alerts — never block the main flow
      void fireAlerts({
        companyId: msg.company_id,
        materialId: result.material_id!,
        type: result.type!,
        quantity: finalQuantity,
        source: "whatsapp",
      }).catch((e) => console.error("[parseAndSave] alert error:", e));
    }
  }

  await service
    .from("wazzup_messages")
    .update({
      parsed: true,
      needs_review: needsReview,
      parse_result: { ...result, transaction_created: transactionCreated },
    })
    .eq("id", messageId);
}

// ─── Alert logic ──────────────────────────────────────────

async function fireAlerts({
  companyId,
  materialId,
  type,
  quantity,
  source,
}: {
  companyId: string;
  materialId: string;
  type: string;
  quantity: number;
  source: string;
}) {
  const service = createServiceClient();

  // Fetch material info
  const { data: mat } = await service
    .from("materials")
    .select("name, unit, gost_norm")
    .eq("id", materialId)
    .single();

  if (!mat) return;

  const materialName = mat.name;
  const unit = mat.unit;

  // 1. Defect alert
  if (type === "defect") {
    await sendTelegramAlert(
      companyId,
      `🚨 <b>Зафиксирован брак</b>\n\n` +
        `Материал: ${materialName}\n` +
        `Количество: ${quantity} ${unit}\n` +
        `Источник: ${source === "whatsapp" ? "WhatsApp" : "Ручной ввод"}`
    );
  }

  // 2. Balance checks — compute once and reuse
  const { data: txs } = await service
    .from("material_transactions")
    .select("type, quantity")
    .eq("company_id", companyId)
    .eq("material_id", materialId);

  let balance = 0;
  for (const tx of txs ?? []) {
    const q = Number(tx.quantity);
    if (tx.type === "income" || tx.type === "return") balance += q;
    else balance -= q;
  }

  // 2a. Critical balance by GOST norm (< 10%)
  if (mat.gost_norm && Number(mat.gost_norm) > 0) {
    const gostNorm = Number(mat.gost_norm);
    if (balance < gostNorm * 0.1) {
      await sendTelegramAlert(
        companyId,
        `📦 <b>Критический остаток</b>\n\n` +
          `Материал: ${materialName}\n` +
          `Остаток: ${balance.toFixed(2)} ${unit}\n` +
          `Норма ГОСТ: ${gostNorm} ${unit}`
      );
    }
  }

  // 2b. Custom threshold alert
  const { data: threshold } = await service
    .from("material_thresholds")
    .select("min_quantity")
    .eq("company_id", companyId)
    .eq("material_id", materialId)
    .maybeSingle();

  if (threshold && balance < Number(threshold.min_quantity)) {
    await sendTelegramAlert(
      companyId,
      `⚠️ <b>Порог остатка достигнут</b>\n\n` +
        `Материал: ${materialName}\n` +
        `Остаток: ${balance.toFixed(2)} ${unit}\n` +
        `Минимум: ${Number(threshold.min_quantity)} ${unit}\n` +
        `Требуется пополнение склада`
    );
  }

  // 3. Plan overrun alert (expense > planned * 1.1 in active plans)
  if (type === "expense") {
    const today = new Date().toISOString().split("T")[0];
    const { data: planMaterials } = await service
      .from("plan_materials")
      .select("planned_quantity, production_plans!inner(id, name, status, start_date, end_date)")
      .eq("material_id", materialId)
      .filter("production_plans.status", "eq", "active")
      .filter("production_plans.company_id", "eq", companyId);

    for (const pm of planMaterials ?? []) {
      const plan = (pm as Record<string, unknown>).production_plans as Record<string, unknown>;
      if (!plan) continue;

      const startDate = plan.start_date as string;
      const endDate = plan.end_date as string;
      if (today < startDate || today > endDate) continue;

      const planned = Number((pm as Record<string, unknown>).planned_quantity);

      const { data: expenses } = await service
        .from("material_transactions")
        .select("quantity")
        .eq("company_id", companyId)
        .eq("material_id", materialId)
        .eq("type", "expense")
        .gte("transaction_date", startDate)
        .lte("transaction_date", endDate);

      const actual = (expenses ?? []).reduce((sum, tx) => sum + Number(tx.quantity), 0);

      if (actual > planned * 1.1) {
        const deviation = Math.round(((actual - planned) / planned) * 100);
        await sendTelegramAlert(
          companyId,
          `⚠️ <b>Перерасход материала</b>\n\n` +
            `Материал: ${materialName}\n` +
            `План: ${planned} ${unit}\n` +
            `Факт: ${actual.toFixed(2)} ${unit}\n` +
            `Отклонение: +${deviation}%\n` +
            `План: ${plan.name}`
        );
      }
    }
  }
}
