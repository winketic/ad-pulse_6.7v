import { createServiceClient } from "@/lib/supabase/service";
import { parseMessage } from "./parser";
import { transcribeVoice } from "./transcribeVoice";
import { parseImageTransaction } from "./parseImage";
import { sendTelegramAlert } from "@/lib/telegram/send";
import { ensureFreshToken } from "./refreshToken";
import {
  GATEWAY_PROVIDER,
  absoluteMediaUrl,
  gatewayMediaToken,
} from "@/lib/whatsapp/gateway";

function convertUnits(qty: number, from: string, to: string): number | null {
  const norm = (v: string) => v.toLowerCase().trim().replace(/[.\s]/g, "").replace(/^тонн?ы?$/, "тонна");
  const f = norm(from);
  const t = norm(to);
  if (f === t) return qty;

  // Русский язык даёт кучу форм: «тонн», «тонны», «тонну», «т».
  // Раньше учитывались только «тонна» и «т», поэтому «80 тонн» уходило
  // на ручной разбор вместо пересчёта в килограммы.
  const isTon = (v: string) => /^(тонн|тонна|тонны|тонну|тоннами|т|tn|ton|tons)$/.test(v);
  const isKg = (v: string) => /^(кг|kg|килограмм|килограмма|килограммы)$/.test(v);
  const isGram = (v: string) => /^(г|g|грамм|грамма|граммы)$/.test(v);
  const isM3 = (v: string) => /^(м3|м³|куб|кубм|m3|кубометр|кубометра|кубометры)$/.test(v);
  const isLiter = (v: string) => /^(л|литр|литра|литры|liter|litre)$/.test(v);

  if (isTon(f) && isKg(t)) return qty * 1000;
  if (isKg(f) && isTon(t)) return qty / 1000;
  if (isKg(f) && isGram(t)) return qty * 1000;
  if (isGram(f) && isKg(t)) return qty / 1000;
  if (isM3(f) && isLiter(t)) return qty * 1000;
  if (isLiter(f) && isM3(t)) return qty / 1000;

  return null; // unknown pair → needs_review
}

export async function parseAndSave(messageId: string): Promise<void> {
  const service = createServiceClient();

  const { data: msg, error: msgErr } = await service
    .from("wazzup_messages")
    // select("*") — переживаем окно до применения миграции 054 (колонки provider/chat_name).
    .select("*")
    .eq("id", messageId)
    .single();

  if (msgErr) console.error(`[parseAndSave] fetch error for id=${messageId}: ${msgErr.message}`);
  if (!msg) return;

  let textToParse: string = msg.raw_text ?? "";

  // Сообщения из нашего шлюза несут относительный путь /media/... и требуют
  // токен шлюза вместо OAuth-токена Wazzup.
  const isGateway = msg.provider === GATEWAY_PROVIDER;
  const mediaUrl = isGateway
    ? absoluteMediaUrl(msg.media_url ?? null)
    : (msg.media_url ?? null);

  const needsMedia =
    (msg.content_type === "voice" || msg.content_type === "image") &&
    !!mediaUrl;

  if (needsMedia) {
    let accessToken = "";
    try {
      accessToken = isGateway
        ? gatewayMediaToken()
        : await ensureFreshToken(msg.company_id);
    } catch (e) {
      console.error("[parseAndSave] token refresh error:", e);
    }

    if (accessToken && mediaUrl) {
      if (msg.content_type === "voice") {
        try {
          const transcription = await transcribeVoice(mediaUrl, accessToken);
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
          const extracted = await parseImageTransaction(mediaUrl, accessToken);
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
  // Единица, в которой движение реально запишется: карточка проверки должна
  // показывать её, а не формулировку из сообщения («80 тонн» → 80 000 кг).
  let finalUnit = result.unit ?? null;
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
        finalUnit = matUnit;
      } else {
        console.warn(`[parseAndSave] unknown unit conversion: ${gptUnit} → ${matUnit}, setting needs_review`);
        unitMismatch = true;
      }
    }
  }

  const autoCreate = result.confidence === "high" && allFound && !unitMismatch;
  // Only flag for review if SOMETHING was found but incomplete — not for irrelevant messages
  const hasAnyField = !!(result.type || result.material_id || result.quantity != null);
  // Фото/голосовое, которое не удалось прочитать (нет OCR, кончились кредиты
  // OpenAI, битый файл), иначе помечалось как «обработано» и исчезало из
  // очереди — клиент просто не видел накладную.
  const mediaUnreadable =
    (msg.content_type === "image" ||
      msg.content_type === "voice" ||
      msg.content_type === "document") &&
    !textToParse.trim();

  // Защита от двойного учёта. Два разных сообщения с одинаковым содержанием
  // («80 тонн цемента» дважды) создают два движения — бухгалтерия удваивается.
  // Если за последние 30 минут уже было такое же движение, отправляем на
  // подтверждение: человек решит, это повторная поставка или дубль.
  let possibleDuplicate = false;
  if (autoCreate) {
    const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: recentSame } = await service
      .from("material_transactions")
      .select("id")
      .eq("company_id", msg.company_id)
      .eq("material_id", result.material_id!)
      .eq("type", result.type!)
      .eq("quantity", finalQuantity)
      .gte("created_at", since)
      .limit(1);

    possibleDuplicate = (recentSame?.length ?? 0) > 0;
    if (possibleDuplicate) {
      console.warn(
        `[parseAndSave] возможен дубль: ${result.type} ${finalQuantity} ${msg.company_id} за 30 минут уже было`
      );
    }
  }

  const needsReview =
    (!autoCreate && hasAnyField) ||
    unitMismatch ||
    mediaUnreadable ||
    possibleDuplicate;

  let transactionCreated = false;

  if (autoCreate && !possibleDuplicate) {
    // Idempotency guard — a redelivered webhook (provider retry) must not
    // create a second transaction for the same inbound message.
    const { data: existingTx } = await service
      .from("material_transactions")
      .select("id")
      .eq("wazzup_message_id", messageId)
      .maybeSingle();

    if (existingTx) {
      transactionCreated = true;
    } else {
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
  }

  await service
    .from("wazzup_messages")
    .update({
      parsed: true,
      needs_review: needsReview,
      parse_result: {
        ...result,
        quantity: finalQuantity,
        unit: finalUnit,
        transaction_created: transactionCreated,
        media_unreadable: mediaUnreadable,
        possible_duplicate: possibleDuplicate,
      },
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
    .is("deleted_at", null)
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
      const { data: companySettings } = await service
        .from("companies")
        .select("stock_alerts_enabled")
        .eq("id", companyId)
        .single();

      if (companySettings?.stock_alerts_enabled !== false) {
        await sendTelegramAlert(
          companyId,
          `📦 <b>Критический остаток</b>\n\n` +
            `Материал: ${materialName}\n` +
            `Остаток: ${balance.toFixed(2)} ${unit}\n` +
            `Норма ГОСТ: ${gostNorm} ${unit}`
        );
      }
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

    type ActivePlan = {
      planned: number;
      name: string;
      startDate: string;
      endDate: string;
    };

    const activePlans: ActivePlan[] = [];
    for (const pm of planMaterials ?? []) {
      const plan = (pm as Record<string, unknown>).production_plans as Record<string, unknown>;
      if (!plan) continue;

      const startDate = plan.start_date as string;
      const endDate = plan.end_date as string;
      if (today < startDate || today > endDate) continue;

      activePlans.push({
        planned: Number((pm as Record<string, unknown>).planned_quantity),
        name: plan.name as string,
        startDate,
        endDate,
      });
    }

    if (activePlans.length > 0) {
      // material_transactions has no plan_id FK (a plan's "actual" is
      // matched by date-range overlap, not a direct relation), so we can't
      // batch via .in(plan_id). Instead: one query bounded by the union of
      // every active plan's date range, then sum per-plan in memory —
      // turns what was previously 1 query per plan into exactly 1 query.
      const minStart = activePlans.reduce((m, p) => (p.startDate < m ? p.startDate : m), activePlans[0].startDate);
      const maxEnd = activePlans.reduce((m, p) => (p.endDate > m ? p.endDate : m), activePlans[0].endDate);

      const { data: expenses } = await service
        .from("material_transactions")
        .select("quantity, transaction_date")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .eq("material_id", materialId)
        .eq("type", "expense")
        .gte("transaction_date", minStart)
        .lte("transaction_date", maxEnd);

      for (const plan of activePlans) {
        const actual = (expenses ?? [])
          .filter((tx) => tx.transaction_date >= plan.startDate && tx.transaction_date <= plan.endDate)
          .reduce((sum, tx) => sum + Number(tx.quantity), 0);

        if (actual > plan.planned * 1.1) {
          const deviation = Math.round(((actual - plan.planned) / plan.planned) * 100);
          await sendTelegramAlert(
            companyId,
            `⚠️ <b>Перерасход материала</b>\n\n` +
              `Материал: ${materialName}\n` +
              `План: ${plan.planned} ${unit}\n` +
              `Факт: ${actual.toFixed(2)} ${unit}\n` +
              `Отклонение: +${deviation}%\n` +
              `План: ${plan.name}`
          );
        }
      }
    }
  }
}
