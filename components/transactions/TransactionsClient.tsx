"use client";

import {
  useState,
  useTransition,
  useMemo,
  useCallback,
  useEffect,
} from "react";
import { useRouter } from "next/navigation";
import { type BalanceData } from "@/components/BalanceCard";
import {
  createTransaction,
  createProductionTransaction,
  type TxType,
} from "@/app/(dashboard)/dashboard/transactions/actions";
import { formatQuantity } from "@/lib/utils/format";
import { isNetworkError, savePending, clearPending } from "@/lib/hooks/useOfflineRetry";
import { useToast } from "@/components/ui/Toast";
import { OfflineRetryBanner } from "@/components/ui/OfflineRetryBanner";

type PendingTx = { form: FormState; type: "regular" | "production" };

const TX_PENDING_KEY = "tx_form";

// Builds the final payload for createTransaction from raw form state.
// Applies the kg→m conversion when the material has kg_per_meter set:
// the user typed kilograms, we store meters and keep the entered kg in
// the note for traceability. Single source of truth — used by both the
// submit path and the offline-retry path.
function buildTxInput(
  form: FormState,
  materials: Material[]
): { type: TxType; material_id: string; quantity: number; note: string | null; counterparty: string | null; transaction_date: string } {
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

  return {
    type: form.type as TxType,
    material_id: form.material_id,
    quantity,
    note,
    counterparty: form.counterparty.trim() || null,
    transaction_date: form.date,
  };
}

async function retryTx(payload: PendingTx, materials: Material[]) {
  if (payload.type === "production") {
    await createProductionTransaction({
      material_id: payload.form.material_id,
      quantity: parseFloat(payload.form.quantity),
      transaction_date: payload.form.date,
    });
  } else {
    await createTransaction(buildTxInput(payload.form, materials));
  }
}

export type { BalanceData };

// ─── Types ────────────────────────────────────────────────

export type { TxType };

export type Transaction = {
  id: string;
  type: TxType;
  quantity: number;
  note: string | null;
  counterparty: string | null;
  transaction_date: string;
  created_at: string;
  material_id: string;
  created_by: string | null;
  material_name: string;
  material_unit: string;
  creator_name: string;
  source: string;
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

type FormState = {
  type: string; // TxType at runtime
  material_id: string;
  quantity: string;
  defect_reason: string;
  note: string;
  counterparty: string;
  date: string;
};

// ─── Config ───────────────────────────────────────────────

// "production" is a UI-only pseudo-type for the modal's type selector —
// the DB never stores a transaction with this type (see
// createProductionTransaction, which decomposes it into real
// income/expense rows). Kept out of Transaction/Filters' TxType on purpose.
type UiTxType = TxType | "production";

const TYPE_CONFIG: Record<
  UiTxType,
  { label: string; bg: string; text: string; sign: string; qColor: string }
> = {
  income: {
    label: "Приход",
    bg: "bg-[var(--success-bg)]",
    text: "text-[var(--success)]",
    sign: "+",
    qColor: "text-[var(--success)]",
  },
  expense: {
    label: "Расход",
    bg: "bg-[var(--danger-bg)]",
    text: "text-[var(--danger)]",
    sign: "−",
    qColor: "text-[var(--danger)]",
  },
  return: {
    label: "Возврат",
    bg: "bg-[var(--info-bg)]",
    text: "text-[var(--info)]",
    sign: "+",
    qColor: "text-[var(--info)]",
  },
  defect: {
    label: "Брак",
    bg: "bg-[var(--warning-bg)]",
    text: "text-[var(--warning)]",
    sign: "−",
    qColor: "text-[var(--warning)]",
  },
  production: {
    label: "Производство",
    bg: "bg-[var(--info-bg)]",
    text: "text-[var(--info)]",
    sign: "+",
    qColor: "text-[var(--info)]",
  },
};

// Full set (incl. "production") — for the modal's type selector only.
const TX_TYPES = Object.keys(TYPE_CONFIG) as UiTxType[];
// Real, persisted DB types only — for the filter bar and any rendering keyed
// off an actual saved Transaction.type (which is never "production").
const DB_TX_TYPES = TX_TYPES.filter((t) => t !== "production") as TxType[];

const todayStr = () => new Date().toISOString().split("T")[0];

// ─── Helpers ──────────────────────────────────────────────

function fmtDate(s: string) {
  const [y, m, d] = s.split("-");
  return `${d}.${m}.${y}`;
}

const isoDay = (offset = 0) =>
  new Date(Date.now() + offset * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

// "Сегодня" / "Вчера" / "24 июня" — human day headers for grouped lists
function dayLabel(dateStr: string): string {
  if (dateStr === isoDay(0)) return "Сегодня";
  if (dateStr === isoDay(-1)) return "Вчера";
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  return d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
}

// Group transactions by transaction_date preserving incoming order
function groupByDay(txs: Transaction[]): { date: string; items: Transaction[] }[] {
  const groups: { date: string; items: Transaction[] }[] = [];
  let current: { date: string; items: Transaction[] } | null = null;
  for (const tx of txs) {
    if (!current || current.date !== tx.transaction_date) {
      current = { date: tx.transaction_date, items: [] };
      groups.push(current);
    }
    current.items.push(tx);
  }
  return groups;
}

function pluralRecords(n: number) {
  if (n % 10 === 1 && n % 100 !== 11) return "запись";
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100))
    return "записи";
  return "записей";
}

// ─── Period segments ──────────────────────────────────────

type Period = "today" | "week" | "all";

const PERIODS: { key: Period; label: string }[] = [
  { key: "today", label: "Сегодня" },
  { key: "week", label: "Неделя" },
  { key: "all", label: "Всё" },
];

// ─── Delta bars — recent movement trend for a material ────
// Bar per movement (oldest→newest), height ∝ |qty|, color = direction.
// Deliberately shows deltas (not absolute balance): honest with only the
// current page of transactions loaded.

function DeltaBars({ deltas }: { deltas: number[] }) {
  if (deltas.length < 2) return <span className="w-11 shrink-0" />;
  const max = Math.max(...deltas.map(Math.abs), 1);
  return (
    <span className="flex items-end gap-[2px] h-4 w-11 shrink-0 justify-end" aria-hidden>
      {deltas.map((d, i) => (
        <span
          key={i}
          className={`w-[3px] rounded-[1px] ${d >= 0 ? "bg-[var(--success)]/70" : "bg-[var(--danger)]/70"}`}
          style={{ height: `${Math.max(2, (Math.abs(d) / max) * 16)}px` }}
        />
      ))}
    </span>
  );
}

// ─── TypeBadge ────────────────────────────────────────────

function TypeBadge({ type }: { type: TxType }) {
  const c = TYPE_CONFIG[type];
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${c.bg} ${c.text}`}
    >
      {c.label}
    </span>
  );
}

// ─── Modal ────────────────────────────────────────────────

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  // Lock body scroll while open — prevents the page behind from scrolling/
  // bouncing (and the modal appearing to "jump") when the mobile keyboard opens.
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  return (
    <div className="fixed inset-0 h-[100dvh] z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        onTouchMove={(e) => e.preventDefault()}
      />
      <div className="relative bg-[var(--card)] w-full h-full sm:h-auto sm:max-h-[94dvh] sm:max-w-lg sm:rounded-2xl shadow-2xl z-10 flex flex-col">
        <div
          className="flex items-center justify-between px-4 shrink-0 border-b border-[var(--border)]"
          style={{ minHeight: "56px", paddingTop: "env(safe-area-inset-top, 0px)" }}
        >
          <h2 className="text-lg font-semibold text-[var(--text)]">{title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-[var(--muted)] hover:text-[var(--muted)] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-4 overflow-y-auto flex-1 min-h-0">{children}</div>
      </div>
    </div>
  );
}

// ─── Add Transaction Form ─────────────────────────────────

function AddTransactionForm({
  materials,
  onSubmit,
  onCancel,
  isPending,
  error,
}: {
  materials: Material[];
  onSubmit: (form: FormState) => void;
  onCancel: () => void;
  isPending: boolean;
  error: string;
}) {
  const [form, setForm] = useState<FormState>({
    type: "income",
    material_id: materials[0]?.id ?? "",
    quantity: "",
    defect_reason: "",
    note: "",
    counterparty: "",
    date: todayStr(),
  });
  const [quantityError, setQuantityError] = useState("");

  const set =
    (k: keyof FormState) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >
    ) => {
      setForm((p) => ({ ...p, [k]: e.target.value }));
      if (k === "quantity") {
        const val = Number(e.target.value);
        setQuantityError(val > 999999999 ? "Максимальное количество: 999 999 999" : "");
      }
    };

  const isDefect = form.type === "defect";
  const isProduction = form.type === "production";

  // "Производство" only makes sense for finished products (перемычки) —
  // i.e. materials that have both consumption norms set.
  const productionMaterials = useMemo(
    () => materials.filter((m) => m.norm_concrete != null && m.norm_rebar != null),
    [materials]
  );
  const visibleMaterials = isProduction ? productionMaterials : materials;

  // Re-point material_id at the first option of whichever list is showing
  // when the user switches into/out of "Производство" — otherwise it could
  // keep pointing at a material that's no longer in the visible dropdown.
  useEffect(() => {
    if (!visibleMaterials.some((m) => m.id === form.material_id)) {
      setForm((p) => ({ ...p, material_id: visibleMaterials[0]?.id ?? "" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProduction]);

  const selectedMaterial = materials.find((m) => m.id === form.material_id);
  const concreteMaterial = materials.find((m) => m.name === "Бетон");
  const rebarMaterialName = selectedMaterial?.rebar_material_name ?? "Арматура";
  const rebarMaterial = materials.find((m) => m.name === rebarMaterialName);

  // kg→m conversion: user enters kg, we store meters (regular types only)
  const kgPerMeter =
    !isProduction &&
    selectedMaterial?.kg_per_meter != null &&
    selectedMaterial.kg_per_meter > 0
      ? selectedMaterial.kg_per_meter
      : null;

  const qtyNum = Number(form.quantity) || 0;
  const concreteAmount =
    isProduction && selectedMaterial?.norm_concrete != null
      ? qtyNum * selectedMaterial.norm_concrete
      : null;
  const rebarAmount =
    isProduction && selectedMaterial?.norm_rebar != null
      ? qtyNum * selectedMaterial.norm_rebar
      : null;

  const canSubmit =
    !!form.material_id &&
    !!form.quantity &&
    Number(form.quantity) > 0 &&
    Number(form.quantity) <= 999999999 &&
    !!form.date &&
    (!isDefect || !!form.defect_reason.trim()) &&
    (!isProduction ||
      (selectedMaterial?.norm_concrete != null && selectedMaterial?.norm_rebar != null));

  const inputCls = "field-input";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
      className="flex flex-col min-h-full"
    >
      {/* Fields — flex-1 so the button row below is pushed flush to the
          bottom of the modal even when there isn't enough content to scroll. */}
      <div className="flex-1 space-y-4">
      {/* Row: type + date */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-[var(--muted)] mb-1.5">
            Тип <span className="text-red-500">*</span>
          </label>
          <select value={form.type} onChange={set("type")} className={inputCls}>
            {TX_TYPES.map((k) => (
              <option key={k} value={k}>
                {TYPE_CONFIG[k].label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--muted)] mb-1.5">
            Дата <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={form.date}
            onChange={set("date")}
            required
            max={todayStr()}
            className={inputCls}
          />
        </div>
      </div>

      {/* Material */}
      <div>
        <label className="block text-sm font-medium text-[var(--muted)] mb-1.5">
          Материал <span className="text-red-500">*</span>
        </label>
        {visibleMaterials.length === 0 ? (
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200">
            <svg
              className="w-4 h-4 text-amber-500 shrink-0"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <p className="text-sm text-amber-700">
              {isProduction
                ? "Нет материалов с заданными нормами расхода. Укажите норму бетона и арматуры в карточке материала."
                : "Сначала добавьте материалы в справочник"}
            </p>
          </div>
        ) : (
          <select
            value={form.material_id}
            onChange={set("material_id")}
            required
            className={inputCls}
          >
            {visibleMaterials.map((m) => (
              <option key={m.id} value={m.id}>
                {isProduction ? m.name : `${m.name} (${m.unit})`}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Quantity */}
      <div>
        <label className="block text-sm font-medium text-[var(--muted)] mb-1.5">
          Количество{" "}
          {kgPerMeter ? (
            <span className="text-[var(--muted)] font-normal">(кг)</span>
          ) : (
            selectedMaterial && (
              <span className="text-[var(--muted)] font-normal">
                ({selectedMaterial.unit})
              </span>
            )
          )}{" "}
          <span className="text-red-500">*</span>
        </label>
        <input
          type="number"
          value={form.quantity}
          onChange={set("quantity")}
          onBlur={(e) => {
            const val = Number(e.target.value);
            if (val > 999999999) {
              setForm((p) => ({ ...p, quantity: "999999999" }));
              setQuantityError("");
            }
          }}
          placeholder="0.0000"
          required
          min="0.0001"
          max="999999999"
          step="0.0001"
          className={`${inputCls} ${quantityError ? "border-red-400 focus:ring-red-300 focus:border-red-400" : ""}`}
        />
        {quantityError ? (
          <p className="mt-1 text-xs text-red-600">{quantityError}</p>
        ) : kgPerMeter && qtyNum > 0 ? (
          <p className="mt-1 text-xs font-medium text-[var(--accent)] tabular-nums">
            = {(qtyNum / kgPerMeter).toFixed(2)} м
          </p>
        ) : (
          <p className="mt-1 text-xs text-[var(--muted)]">Макс. 999 999 999</p>
        )}

        {/* Production preview — live calc of what will be auto-deducted */}
        {isProduction && qtyNum > 0 && concreteAmount != null && rebarAmount != null && (
          <div className="mt-2 flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg bg-[#00f5c4]/8 border border-[#00f5c4]/20">
            <svg className="w-4 h-4 text-[#00a884] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-[var(--text)]">
              Спишется: бетон {concreteAmount.toFixed(2)} {concreteMaterial?.unit ?? "м³"}, {rebarMaterialName.toLowerCase()} {rebarAmount.toFixed(2)} {rebarMaterial?.unit ?? "кг"}
            </p>
          </div>
        )}
      </div>

      {/* Defect reason — only for 'defect' type */}
      {isDefect && (
        <div>
          <label className="block text-sm font-medium text-[var(--muted)] mb-1.5">
            Причина брака <span className="text-red-500">*</span>
          </label>
          <textarea
            value={form.defect_reason}
            onChange={set("defect_reason")}
            placeholder="Опишите причину появления брака..."
            required
            rows={2}
            className="field-textarea"
          />
        </div>
      )}

      {/* Note */}
      <div>
        <label className="block text-sm font-medium text-[var(--muted)] mb-1.5">
          Примечание
          <span className="ml-1.5 text-xs font-normal text-[var(--muted)]">
            (необязательно)
          </span>
        </label>
        <textarea
          value={form.note}
          onChange={set("note")}
          placeholder="Дополнительная информация..."
          rows={2}
          className="field-textarea"
        />
      </div>

      {/* Counterparty */}
      {!isProduction && (
        <div>
          <label className="block text-sm font-medium text-[var(--muted)] mb-1.5">
            Контрагент
            <span className="ml-1.5 text-xs font-normal text-[var(--muted)]">
              (необязательно)
            </span>
          </label>
          <input
            type="text"
            value={form.counterparty}
            onChange={set("counterparty")}
            placeholder="Название компании"
            maxLength={200}
            className="field-input"
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-red-50 border border-red-200">
          <svg
            className="w-4 h-4 text-red-500 shrink-0 mt-0.5"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clipRule="evenodd"
            />
          </svg>
          <span className="text-sm text-red-700">{error}</span>
        </div>
      )}
      </div>

      {/* Buttons — sticky to bottom of scroll area so they're always reachable without scrolling */}
      <div className="flex gap-3 pt-3 sticky bottom-0 -mx-4 -mb-4 px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:pb-4 bg-[var(--card)] border-t border-[var(--border)]">
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="flex-1 py-2.5 px-4 rounded-lg border border-gray-300 text-sm font-medium text-[var(--muted)] hover:bg-[var(--bg3)] transition-colors disabled:opacity-50 min-h-[48px]"
        >
          Отмена
        </button>
        <button
          type="submit"
          disabled={isPending || !canSubmit}
          className="dp-btn-primary flex-1 rounded-lg"
        >
          {isPending && (
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {isPending ? "Сохранение..." : "Добавить запись"}
        </button>
      </div>
    </form>
  );
}

// ─── Empty state ──────────────────────────────────────────

function EmptyState({
  isFiltered,
  onAdd,
}: {
  isFiltered: boolean;
  onAdd: () => void;
}) {
  if (isFiltered) {
    return (
      <div className="text-center py-16 bg-[var(--card)] rounded-xl border border-[var(--border)]">
        <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6 text-[var(--muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-[var(--muted)]">Нет результатов</p>
        <p className="text-sm text-[var(--muted)] mt-0.5">
          Измените или сбросьте фильтры
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-[#00f5c4]/5 flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-[#00f5c4]/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.4}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      </div>
      <h3 className="text-base font-semibold text-[var(--text)] mb-1">
        Движений ещё нет
      </h3>
      <p className="text-sm text-[var(--muted)] mb-6 max-w-xs">
        Зафиксируйте первый приход или расход материала
      </p>
      <button
        onClick={onAdd}
        className="dp-btn-primary rounded-xl"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        Добавить запись
      </button>
    </div>
  );
}

// ─── Pagination ───────────────────────────────────────────

function Pagination({
  page,
  totalPages,
  totalCount,
}: {
  page: number;
  totalPages: number;
  totalCount: number;
}) {
  const router = useRouter();
  if (totalPages <= 1) return null;

  const go = (p: number) => router.push(`?page=${p}`);

  return (
    <div className="flex items-center justify-between mt-4 px-1">
      <p className="text-sm text-[var(--muted)]">
        Страница <span className="font-semibold text-gray-800">{page}</span>{" "}
        из {totalPages} · {totalCount} {pluralRecords(totalCount)} всего
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => go(page - 1)}
          disabled={page <= 1}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--border)] text-sm font-medium text-[var(--muted)] hover:bg-[var(--bg3)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Предыдущая
        </button>
        <button
          onClick={() => go(page + 1)}
          disabled={page >= totalPages}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--border)] text-sm font-medium text-[var(--muted)] hover:bg-[var(--bg3)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Следующая
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────

export default function TransactionsClient({
  transactions,
  materials,
  page,
  totalPages,
  totalCount,
  initialMaterialId,
}: {
  transactions: Transaction[];
  materials: Material[];
  initialBalances?: BalanceData[];
  page?: number;
  totalPages?: number;
  totalCount?: number;
  initialMaterialId?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [modalOpen, setModalOpen] = useState(false);
  const [period, setPeriod] = useState<Period>("week");
  const [typeFilter, setTypeFilter] = useState<TxType | "all">("all");
  const [materialFilter, setMaterialFilter] = useState<string>(initialMaterialId ?? "all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");

  // Optimistic rows shown instantly while the server call is in flight.
  // Cleared as soon as fresh server data arrives via router.refresh().
  const [optimistic, setOptimistic] = useState<Transaction[]>([]);
  useEffect(() => {
    setOptimistic([]);
  }, [transactions]);

  // Optimistic rows merged on top, re-sorted so a backdated entry lands in
  // its own day group instead of floating above "Сегодня".
  const displayTxs = useMemo(() => {
    if (optimistic.length === 0) return transactions;
    return [...optimistic, ...transactions].sort((a, b) =>
      b.transaction_date.localeCompare(a.transaction_date)
    );
  }, [optimistic, transactions]);

  // Delta history per material (oldest→newest within loaded page) for bars
  const deltasByMaterial = useMemo(() => {
    const map = new Map<string, number[]>();
    for (let i = displayTxs.length - 1; i >= 0; i--) {
      const tx = displayTxs[i];
      const delta =
        tx.type === "income" || tx.type === "return" ? tx.quantity : -tx.quantity;
      const list = map.get(tx.material_id) ?? [];
      list.push(delta);
      map.set(tx.material_id, list);
    }
    map.forEach((v, k) => map.set(k, v.slice(-8)));
    return map;
  }, [displayTxs]);

  const filtered = useMemo(() => {
    return displayTxs.filter((tx) => {
      if (period === "today" && tx.transaction_date !== isoDay(0)) return false;
      if (period === "week" && tx.transaction_date < isoDay(-6)) return false;
      if (typeFilter !== "all" && tx.type !== typeFilter) return false;
      if (materialFilter !== "all" && tx.material_id !== materialFilter) return false;
      return true;
    });
  }, [displayTxs, period, typeFilter, materialFilter]);

  const hasFilters = typeFilter !== "all" || materialFilter !== "all" || period !== "all";
  const filterMaterialName =
    materialFilter !== "all" ? materials.find((m) => m.id === materialFilter)?.name : null;

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setFormError("");
  }, []);

  const handleAdd = useCallback(
    (form: FormState) => {
      setFormError("");

      // Production decomposes into several rows server-side — keep the
      // modal open until the RPC confirms (no meaningful optimistic shape).
      if (form.type === "production") {
        startTransition(async () => {
          try {
            await createProductionTransaction({
              material_id: form.material_id,
              quantity: parseFloat(form.quantity),
              transaction_date: form.date,
            });
            clearPending(TX_PENDING_KEY);
            router.refresh();
            closeModal();
          } catch (e) {
            if (isNetworkError(e)) {
              const mat = materials.find((m) => m.id === form.material_id);
              const label = `Производство — ${mat?.name ?? "материал"}, ${form.quantity} ${mat?.unit ?? ""}`;
              savePending<PendingTx>(TX_PENDING_KEY, { form, type: "production" }, label);
              toast("Нет связи — данные сохранены локально", "info");
              closeModal();
            } else {
              setFormError(e instanceof Error ? e.message : "Ошибка добавления записи");
            }
          }
        });
        return;
      }

      // Regular types: optimistic — instant row, modal closes immediately.
      // buildTxInput applies the kg→m conversion when the material has
      // kg_per_meter, so both the optimistic row and the server payload
      // carry the converted (meters) quantity.
      const input = buildTxInput(form, materials);
      const mat = materials.find((m) => m.id === form.material_id);
      const hasConversion = mat?.kg_per_meter != null && mat.kg_per_meter > 0;
      const temp: Transaction = {
        id: `tmp-${Date.now()}`,
        type: input.type,
        quantity: input.quantity,
        note: input.note,
        counterparty: input.counterparty,
        transaction_date: input.transaction_date,
        created_at: new Date().toISOString(),
        material_id: input.material_id,
        created_by: null,
        material_name: mat?.name ?? "—",
        material_unit: mat?.unit ?? "",
        creator_name: "Вы",
        source: "manual",
      };
      setOptimistic((prev) => [temp, ...prev]);
      closeModal();
      toast("Запись добавлена");

      startTransition(async () => {
        try {
          await createTransaction(input);
          clearPending(TX_PENDING_KEY);
          router.refresh();
        } catch (e) {
          setOptimistic((prev) => prev.filter((t) => t.id !== temp.id));
          if (isNetworkError(e)) {
            const enteredLabel = hasConversion
              ? `${form.quantity} кг`
              : `${form.quantity} ${mat?.unit ?? ""}`;
            const label = `${TYPE_CONFIG[input.type].label} — ${mat?.name ?? "материал"}, ${enteredLabel}`;
            savePending<PendingTx>(TX_PENDING_KEY, { form, type: "regular" }, label);
            toast("Нет связи — данные сохранены локально", "info");
          } else {
            toast(
              e instanceof Error ? `Не сохранено: ${e.message}` : "Ошибка добавления записи",
              "error"
            );
          }
        }
      });
    },
    [router, closeModal, toast, materials]
  );

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <OfflineRetryBanner<PendingTx>
        pendingKey={TX_PENDING_KEY}
        onRetry={(payload) => retryTx(payload, materials)}
      />
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-display text-[var(--text)]">
            Движение материалов
          </h1>
          <p className="text-label mt-1.5">
            {(totalCount ?? transactions.length) === 0
              ? "Записей нет"
              : `${totalCount ?? transactions.length} ${pluralRecords(totalCount ?? transactions.length)}`}
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="dp-btn-primary rounded-xl self-start sm:self-auto"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Добавить запись
        </button>
      </div>

      {/* ── Balance Cards ───────────────────────────────── */}
      {/* ── Period segments ─────────────────────────────── */}
      {transactions.length > 0 && (
        <>
          <div className="flex items-center bg-[var(--surface-2)] rounded-xl p-1 mb-2.5 w-fit">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors tap-scale ${
                  period === p.key
                    ? "bg-[var(--surface-3)] text-[var(--text)] shadow-sm"
                    : "text-[var(--muted)]"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Type chips + material badge */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 mb-3 -mx-4 px-4 sm:mx-0 sm:px-0">
            <button
              onClick={() => setTypeFilter("all")}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap tap-scale transition-colors ${
                typeFilter === "all"
                  ? "bg-[var(--text)] text-[var(--bg)]"
                  : "bg-[var(--surface-2)] text-[var(--muted)]"
              }`}
            >
              Все
            </button>
            {DB_TX_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(typeFilter === t ? "all" : t)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap tap-scale transition-colors ${
                  typeFilter === t
                    ? `${TYPE_CONFIG[t].bg} ${TYPE_CONFIG[t].text} ring-1 ring-current`
                    : "bg-[var(--surface-2)] text-[var(--muted)]"
                }`}
              >
                {TYPE_CONFIG[t].label}
              </button>
            ))}
            {filterMaterialName && (
              <button
                onClick={() => setMaterialFilter("all")}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap bg-[var(--accent-15)] text-[var(--accent)] tap-scale"
              >
                {filterMaterialName}
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </>
      )}

      {/* ── Empty state ─────────────────────────────────── */}
      {filtered.length === 0 && (
        <EmptyState
          isFiltered={hasFilters && transactions.length > 0}
          onAdd={() => setModalOpen(true)}
        />
      )}

      {/* ── Compact list — one pattern for all widths ───── */}
      {filtered.length > 0 && (
        <div className="bg-[var(--surface-1)] rounded-xl border border-[var(--border)] overflow-hidden">
          {groupByDay(filtered).map((group) => (
            <div key={group.date}>
              {period !== "today" && (
                <div className="flex items-baseline gap-2 px-3.5 py-1.5 bg-[var(--surface-2)]/60 border-b border-[var(--border)]">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                    {dayLabel(group.date)}
                  </span>
                  <span className="num text-[10px] text-[var(--muted-2)]">{fmtDate(group.date)}</span>
                </div>
              )}
              <div className="divide-y divide-[var(--border)]">
                {group.items.map((tx) => {
                  const cfg = TYPE_CONFIG[tx.type];
                  const isTemp = tx.id.startsWith("tmp-");
                  const expanded = expandedId === tx.id;
                  return (
                    <div key={tx.id} className={isTemp ? "opacity-60 animate-pulse" : ""}>
                      {/* Compact row: dot · qty · name/creator · delta bars */}
                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : tx.id)}
                        className="w-full flex items-center gap-2.5 min-h-[44px] px-3.5 py-1.5 text-left hover:bg-[var(--surface-2)] transition-colors"
                        style={{ WebkitTapHighlightColor: "transparent" }}
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{
                            background: `var(--${
                              tx.type === "income"
                                ? "success"
                                : tx.type === "expense"
                                ? "danger"
                                : tx.type === "defect"
                                ? "warning"
                                : "info"
                            })`,
                          }}
                        />
                        <span className={`num text-sm font-bold w-[72px] shrink-0 ${cfg.qColor}`}>
                          {cfg.sign}
                          {formatQuantity(tx.quantity)}
                        </span>
                        <span className="flex-1 min-w-0 text-sm text-[var(--text)] truncate">
                          {tx.material_name}
                          <span className="text-[var(--muted-2)] text-xs"> · {tx.creator_name}</span>
                        </span>
                        <DeltaBars deltas={deltasByMaterial.get(tx.material_id) ?? []} />
                      </button>

                      {/* Expanded detail */}
                      {expanded && (
                        <div className="px-3.5 pb-3 pt-0.5 pl-10 space-y-1" style={{ animation: "fadeIn 120ms var(--ease) both" }}>
                          <p className="text-xs text-[var(--muted)]">
                            <TypeBadge type={tx.type} />
                            <span className="num ml-2">{fmtDate(tx.transaction_date)}</span>
                            <span className="ml-2">{tx.material_unit}</span>
                            {tx.source === "whatsapp" && <span className="ml-2 text-[#25D366]">WhatsApp</span>}
                          </p>
                          {tx.counterparty && (
                            <p className="text-xs text-[var(--muted)]">Контрагент: <span className="text-[var(--text)]">{tx.counterparty}</span></p>
                          )}
                          {tx.note && (
                            <p className="text-xs text-[var(--muted)] whitespace-pre-line">{tx.note}</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Pagination ──────────────────────────────────── */}
      {page != null && totalPages != null && totalCount != null && (
        <Pagination page={page} totalPages={totalPages} totalCount={totalCount} />
      )}

      {/* ── Modal ───────────────────────────────────────── */}
      {modalOpen && (
        <Modal title="Добавить запись движения" onClose={closeModal}>
          <AddTransactionForm
            materials={materials}
            onSubmit={handleAdd}
            onCancel={closeModal}
            isPending={isPending}
            error={formError}
          />
        </Modal>
      )}
    </div>
  );
}
