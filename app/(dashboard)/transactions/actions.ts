"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

export type TxType = "income" | "expense" | "return" | "defect";

export type TransactionInput = {
  type: TxType;
  material_id: string;
  quantity: number;
  note: string | null;
  transaction_date: string;
};

async function getSupabaseAndUser() {
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

  return { supabase, user, company_id: profile.company_id as string };
}

export async function createTransaction(input: TransactionInput) {
  const { supabase, user, company_id } = await getSupabaseAndUser();

  if (input.quantity <= 0) throw new Error("Количество должно быть больше нуля");

  const { error } = await supabase.from("material_transactions").insert({
    company_id,
    material_id: input.material_id,
    type: input.type,
    quantity: input.quantity,
    note: input.note,
    transaction_date: input.transaction_date,
    created_by: user.id,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/transactions");
  revalidatePath("/dashboard");
}
