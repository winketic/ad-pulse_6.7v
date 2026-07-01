"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { sendTelegramAlert } from "@/lib/telegram/send";

export type TxType = "income" | "expense" | "return" | "defect";

export type TransactionInput = {
  type: TxType;
  material_id: string;
  quantity: number;
  note: string | null;
  transaction_date: string;
  counterparty?: string | null;
};

async function getSupabaseAndUser() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Не авторизован");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", user.id)
    .single();

  if (profileError) throw new Error(`DB error: ${profileError.message}`);
  if (!profile?.company_id) throw new Error("Компания не найдена");

  return { supabase, user, company_id: profile.company_id as string };
}

export type ProductionTransactionInput = {
  material_id: string; // готовая продукция (перемычка)
  quantity: number;
  transaction_date: string;
};

// Creates 3 transactions atomically via a Postgres function: income of the
// product + expense of concrete/rebar by its norms. See migration
// 023_create_production_transaction.sql.
export async function createProductionTransaction(input: ProductionTransactionInput) {
  const { supabase } = await getSupabaseAndUser();

  if (input.quantity <= 0) throw new Error("Количество должно быть больше нуля");
  if (input.quantity > 999999999) throw new Error("Количество превышает максимально допустимое значение");

  const { error } = await supabase.rpc("create_production_transaction", {
    p_product_material_id: input.material_id,
    p_quantity: input.quantity,
    p_transaction_date: input.transaction_date,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/transactions");
  revalidatePath("/dashboard");
}

export async function createTransaction(input: TransactionInput) {
  const { supabase, user, company_id } = await getSupabaseAndUser();

  if (input.quantity <= 0) throw new Error("Количество должно быть больше нуля");
  if (input.quantity > 999999999) throw new Error("Количество превышает максимально допустимое значение");

  const { error } = await supabase.from("material_transactions").insert({
    company_id,
    material_id: input.material_id,
    type: input.type,
    quantity: input.quantity,
    note: input.note,
    counterparty: input.counterparty ?? null,
    transaction_date: input.transaction_date,
    created_by: user.id,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/transactions");
  revalidatePath("/dashboard");

  // Fire alerts after successful insert — non-blocking
  void fireAlerts({ supabase, company_id, input }).catch((e) =>
    console.error("[createTransaction] alert error:", e)
  );
}

async function fireAlerts({
  supabase,
  company_id,
  input,
}: {
  supabase: Awaited<ReturnType<typeof import("@/utils/supabase/server").createClient>>;
  company_id: string;
  input: TransactionInput;
}) {
  // Fetch material info
  const { data: material, error: materialError } = await supabase
    .from("materials")
    .select("name, unit, gost_norm")
    .eq("id", input.material_id)
    .single();

  if (materialError) throw new Error(`DB error: ${materialError.message}`);
  if (!material) return;

  // 1. Defect alert
  if (input.type === "defect") {
    await sendTelegramAlert(
      company_id,
      `🚨 <b>Зафиксирован брак</b>\n\n` +
        `Материал: ${material.name}\n` +
        `Количество: ${input.quantity} ${material.unit}\n` +
        `Источник: Ручной ввод`
    );
  }

  // 2. Critical balance alert
  const { data: txs } = await supabase
    .from("material_transactions")
    .select("quantity, type")
    .eq("material_id", input.material_id)
    .eq("company_id", company_id);

  const currentBalance =
    txs?.reduce((sum, t) => {
      const q = Number(t.quantity);
      return t.type === "income" || t.type === "return" ? sum + q : sum - q;
    }, 0) ?? 0;

  if (material.gost_norm && currentBalance < Number(material.gost_norm) * 0.1) {
    const { data: companySettings } = await supabase
      .from("companies")
      .select("stock_alerts_enabled")
      .eq("id", company_id)
      .single();

    if (companySettings?.stock_alerts_enabled !== false) {
      await sendTelegramAlert(
        company_id,
        `📦 <b>Критический остаток</b>\n\n` +
          `Материал: ${material.name}\n` +
          `Остаток: ${currentBalance.toFixed(2)} ${material.unit}\n` +
          `Норма: ${material.gost_norm} ${material.unit}`
      );
    }
  }
}
