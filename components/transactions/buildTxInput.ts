import type { TxType } from "@/app/(dashboard)/dashboard/transactions/actions";

// Pure form → payload mapping for the Движение modal. Lives outside
// TransactionsClient.tsx (a "use client" component that pulls in React, the
// Supabase client and the server actions) so it can be unit-tested on its own.
// Only type imports here — keep it that way.

// Справочник контрагентов (миграция 042). Пустой массив = миграция ещё не
// применена → форма откатывается на свободный текстовый ввод.
export type Counterparty = {
  id: string;
  name: string;
};

export type Material = {
  id: string;
  name: string;
  unit: string;
  norm_concrete?: number | null;
  norm_rebar?: number | null;
  rebar_material_name?: string | null;
  // kg→m conversion: when set, the user enters kg in the form and the
  // transaction is stored in meters (quantity = kg / kg_per_meter)
  kg_per_meter?: number | null;
};

export type FormState = {
  type: string; // TxType at runtime
  material_id: string;
  quantity: string;
  defect_reason: string;
  note: string;
  counterparty: string; // свободный текст — фоллбэк, пока справочник пуст
  counterparty_id: string; // выбор из справочника; "" = не выбран
  load_index: string; // индекс нагрузки отгрузки ("8"/"20"/"27"/"37"); "" = без индекса
  date: string;
  unit_price: string; // цена за ед. (тг), строка ввода; "" = не указана
};

export type TxInput = {
  type: TxType;
  material_id: string;
  quantity: number;
  note: string | null;
  counterparty: string | null;
  transaction_date: string;
  unit_price: number | null;
  load_index: string | null;
  counterparty_id: string | null;
};

// Builds the final payload for createTransaction from raw form state.
// Applies the kg→m conversion when the material has kg_per_meter set:
// the user typed kilograms, we store meters and keep the entered kg in
// the note for traceability. Single source of truth — used by both the
// submit path and the offline-retry path.
export function buildTxInput(
  form: FormState,
  materials: Material[],
  counterparties: Counterparty[] = []
): TxInput {
  const noteBase =
    form.type === "defect"
      ? form.defect_reason.trim() +
        (form.note.trim() ? `\n\n${form.note.trim()}` : "")
      : form.note.trim() || null;

  const mat = materials.find((m) => m.id === form.material_id);
  const kgPerMeter =
    mat?.kg_per_meter != null && mat.kg_per_meter > 0 ? mat.kg_per_meter : null;

  const rawQty = parseFloat(form.quantity);
  const quantity = kgPerMeter
    ? Math.round((rawQty / kgPerMeter) * 10000) / 10000
    : rawQty;
  const kgNote = kgPerMeter ? `(введено: ${rawQty} кг)` : null;
  const note = kgNote ? (noteBase ? `${noteBase}\n${kgNote}` : kgNote) : noteBase;

  // Цена относится к единице хранения (для «Арматуры» — за метр). Только для
  // прихода/расхода; для остальных типов поле скрыто и остаётся пустым → null.
  const priceRaw = parseFloat(form.unit_price);
  const unit_price =
    (form.type === "income" || form.type === "expense") &&
    Number.isFinite(priceRaw) &&
    priceRaw > 0
      ? Math.round(priceRaw * 100) / 100
      : null;

  // Контрагент: когда выбран из справочника — пишем и id, и его имя в текстовую
  // колонку counterparty. Текст нужен, чтобы прежние отчёты (они группируют по
  // тексту) продолжали работать, и чтобы запись осталась читаемой, даже если
  // контрагента потом удалят из справочника.
  const cp = counterparties.find((c) => c.id === form.counterparty_id);
  const counterpartyText = cp ? cp.name : form.counterparty.trim() || null;

  // Индекс нагрузки — только на отгрузке. Это же требует CHECK в миграции 042.
  const load_index =
    form.type === "expense" && form.load_index.trim() ? form.load_index.trim() : null;

  return {
    type: form.type as TxType,
    material_id: form.material_id,
    quantity,
    note,
    counterparty: counterpartyText,
    transaction_date: form.date,
    unit_price,
    load_index,
    counterparty_id: cp ? cp.id : null,
  };
}
