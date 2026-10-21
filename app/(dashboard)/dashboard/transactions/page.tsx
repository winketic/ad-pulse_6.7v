import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import TransactionsClient from "@/components/transactions/TransactionsClient";
import type {
  Transaction,
  Material,
  Counterparty,
  PriceRow,
} from "@/components/transactions/TransactionsClient";
import type { BalanceData } from "@/components/BalanceCard";
import type { TxType } from "./actions";
import NoCompanyState from "@/components/ui/NoCompanyState";
import { fetchAllPages } from "@/lib/supabase/fetchAllPages";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PAGE_SIZE = 50;

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: { page?: string; material_id?: string };
}) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id, role")
    .eq("id", user.id)
    .single();

  const company_id = profile?.company_id as string | undefined;
  if (!company_id) return <NoCompanyState />;
  const isAdmin = profile?.role === "admin";
  const isWorkshop = profile?.role === "workshop";

  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const rangeFrom = (page - 1) * PAGE_SIZE;
  const rangeTo = rangeFrom + PAGE_SIZE - 1;

  let txQuery = supabase
    .from("material_transactions")
    .select("*")
    .eq("company_id", company_id);
  let countQuery = supabase.from("material_transactions").select("id", { count: "exact", head: true }).eq("company_id", company_id).is("deleted_at", null);
  let balanceQuery = supabase.from("material_transactions").select("material_id, type, quantity").eq("company_id", company_id).is("deleted_at", null);
  if (isWorkshop) {
    txQuery = txQuery.eq("created_by", user.id).eq("type", "expense");
    countQuery = countQuery.eq("created_by", user.id).eq("type", "expense");
    balanceQuery = balanceQuery.eq("created_by", user.id).eq("type", "expense");
  }

  // Полный порядок для постраничной загрузки (balanceQuery переиспользуется
  // между страницами, поэтому сортировка задаётся один раз): created_at +
  // уникальный id, иначе range() может дублировать и терять строки.
  balanceQuery = balanceQuery
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  const [txResult, countResult, matResult, profilesResult, balanceTxRows] =
    await Promise.all([
      // Paginated list — includes deleted rows so an admin can toggle
      // "показать удалённые"; the client hides them by default.
      txQuery
        .order("transaction_date", { ascending: false })
        .order("created_at", { ascending: false })
        .range(rangeFrom, rangeTo),

      // Total count — active (non-deleted) rows only for the headline
      countQuery,

      // Materials lookup — select("*") so not-yet-migrated columns
      // (kg_per_meter) don't fail the whole query before migration 033
      supabase
        .from("materials")
        .select("*")
        .eq("company_id", company_id)
        .order("name"),

      // Profiles lookup — select("*") so the not-yet-migrated phone column
      // (migration 019) can't fail the whole query and blank out all
      // creator names; phone is only needed for WhatsApp sender matching
      isWorkshop
        ? supabase.from("profiles").select("*").eq("company_id", company_id).eq("id", user.id)
        : supabase.from("profiles").select("*").eq("company_id", company_id),

      // Paginate the full active history so balances do not silently truncate
      // at PostgREST's default row limit. balanceQuery carries the full
      // (created_at, id) order set above, so pages never overlap.
      fetchAllPages((from, to) => balanceQuery.range(from, to)),
    ]);

  // ── Фаза 6: справочник контрагентов и прайс ──────────────────────────
  // Fail-open: таблицы появляются только в миграции 042/045. Пока их нет,
  // запрос вернёт error — отдаём пустые массивы, и форма отгрузки тихо
  // откатывается на прежнее поведение (свободный текст + подсказка цены).
  const [cpResult, priceResult] = await Promise.all([
    supabase.from("counterparties").select("*").eq("company_id", company_id).order("name"),
    supabase.from("price_list").select("*").eq("company_id", company_id),
  ]);

  const counterparties: Counterparty[] = (cpResult.data ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
  }));

  const priceList: PriceRow[] = (priceResult.data ?? []).map((r) => ({
    material_id: r.material_id as string,
    counterparty_id: r.counterparty_id as string,
    load_index: String(r.load_index),
    price: Number(r.price),
  }));

  const totalCount = countResult.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const matMap = new Map((matResult.data ?? []).map((m) => [m.id, m]));
  const profileMap = new Map((profilesResult.data ?? []).map((p) => [p.id, p]));
  // phone → full_name for WhatsApp sender lookup
  const phoneMap = new Map(
    (profilesResult.data ?? [])
      .filter((p) => p.phone)
      .map((p) => [p.phone as string, p.full_name])
  );

  // Batch fetch wazzup_messages for WhatsApp-sourced transactions
  const whatsappTxIds = (txResult.data ?? [])
    .filter((tx) => tx.source === "whatsapp" && tx.wazzup_message_id)
    .map((tx) => tx.wazzup_message_id as string);

  const wazzupMsgMap = new Map<string, string>();
  if (whatsappTxIds.length > 0) {
    const { data: wazzupMsgs } = await supabase
      .from("wazzup_messages")
      .select("id, sender_phone")
      .in("id", whatsappTxIds);
    for (const m of wazzupMsgs ?? []) {
      if (m.sender_phone) {
        wazzupMsgMap.set(m.id, phoneMap.get(m.sender_phone) ?? m.sender_phone);
      }
    }
  }

  const transactions: Transaction[] = (txResult.data ?? []).map((tx) => {
    let creatorName = "—";
    if (tx.source === "whatsapp" && tx.wazzup_message_id) {
      creatorName = wazzupMsgMap.get(tx.wazzup_message_id) ?? "WhatsApp";
    } else if (tx.created_by) {
      creatorName = profileMap.get(tx.created_by)?.full_name ?? "—";
    }
    const rawTx = tx as Record<string, unknown>;
    const deletedAt = (rawTx.deleted_at as string | null) ?? null;
    const deletedBy = (rawTx.deleted_by as string | null) ?? null;
    return {
      id: tx.id,
      type: tx.type as TxType,
      quantity: Number(tx.quantity),
      note: tx.note ?? null,
      counterparty: (tx.counterparty as string | null) ?? null,
      transaction_date: tx.transaction_date ?? (tx.created_at as string).split("T")[0],
      created_at: tx.created_at,
      material_id: tx.material_id,
      created_by: tx.created_by ?? null,
      material_name: matMap.get(tx.material_id)?.name ?? "Неизвестный материал",
      material_unit: matMap.get(tx.material_id)?.unit ?? "",
      creator_name: creatorName,
      source: tx.source ?? "manual",
      // Новые колонки читаем через rawTx: до применения миграций их нет,
      // обращение к tx.* напрямую не прошло бы типизацию
      unit_price: rawTx.unit_price != null ? Number(rawTx.unit_price) : null,
      load_index: (rawTx.load_index as string | null) ?? null,
      deleted_at: deletedAt,
      deleted_by_name: deletedBy ? profileMap.get(deletedBy)?.full_name ?? "—" : null,
    };
  });

  const materials: Material[] = (matResult.data ?? []).map((m) => {
    const raw = m as Record<string, unknown>;
    return {
      id: m.id,
      name: m.name,
      unit: m.unit,
      norm_concrete: m.norm_concrete != null ? Number(m.norm_concrete) : null,
      norm_rebar: m.norm_rebar != null ? Number(m.norm_rebar) : null,
      rebar_material_name: (raw.rebar_material_name as string | null) ?? null,
      kg_per_meter: raw.kg_per_meter != null ? Number(raw.kg_per_meter) : null,
    };
  });

  // Compute balances server-side from all transactions
  const balMap = new Map<
    string,
    { material_id: string; name: string; unit: string; balance: number; totalIn: number; totalOut: number }
  >();
  for (const m of matResult.data ?? []) {
    balMap.set(m.id, { material_id: m.id, name: m.name, unit: m.unit, balance: 0, totalIn: 0, totalOut: 0 });
  }
  for (const tx of balanceTxRows) {
    const b = balMap.get(tx.material_id);
    if (!b) continue;
    const qty = Number(tx.quantity);
    if (tx.type === "income" || tx.type === "return") {
      b.totalIn += qty;
      b.balance += qty;
    } else {
      b.totalOut += qty;
      b.balance -= qty;
    }
  }
  const initialBalances: BalanceData[] = Array.from(balMap.values())
    .filter((b) => b.totalIn > 0 || b.totalOut > 0)
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));

  // Full balance per material (incl. zero-movement rows) — the production form
  // uses these to warn before a выпуск would drive raw stock negative.
  const balancesByMaterial: Record<string, number> = {};
  for (const b of Array.from(balMap.values())) balancesByMaterial[b.material_id] = b.balance;

  return (
    <TransactionsClient
      transactions={transactions}
      materials={materials}
      initialBalances={initialBalances}
      balancesByMaterial={balancesByMaterial}
      page={page}
      totalPages={totalPages}
      totalCount={totalCount}
      initialMaterialId={searchParams.material_id}
      isAdmin={isAdmin}
      role={profile?.role ?? "warehouse"}
      counterparties={counterparties}
      priceList={priceList}
    />
  );
}
