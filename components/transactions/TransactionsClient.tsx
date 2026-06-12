"use client";

import {
  useState,
  useTransition,
  useMemo,
  useCallback,
  useEffect,
} from "react";
import { useRouter } from "next/navigation";
import BalanceCard, { type BalanceData } from "@/components/BalanceCard";
import { createTransaction, type TxType } from "@/app/(dashboard)/dashboard/transactions/actions";
import { formatQuantity } from "@/lib/utils/format";

export type { BalanceData };

// ─── Types ────────────────────────────────────────────────

export type { TxType };

export type Transaction = {
  id: string;
  type: TxType;
  quantity: number;
  note: string | null;
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
};

type Filters = {
  type: TxType | "all";
  material_id: string;
  dateFrom: string;
  dateTo: string;
};

type FormState = {
  type: string; // TxType at runtime
  material_id: string;
  quantity: string;
  defect_reason: string;
  note: string;
  date: string;
};

// ─── Config ───────────────────────────────────────────────

const TYPE_CONFIG: Record<
  TxType,
  { label: string; bg: string; text: string; sign: string; qColor: string }
> = {
  income: {
    label: "Приход",
    bg: "bg-green-100",
    text: "text-green-700",
    sign: "+",
    qColor: "text-green-700",
  },
  expense: {
    label: "Расход",
    bg: "bg-red-100",
    text: "text-red-700",
    sign: "−",
    qColor: "text-red-700",
  },
  return: {
    label: "Возврат",
    bg: "bg-blue-100",
    text: "text-blue-700",
    sign: "+",
    qColor: "text-blue-700",
  },
  defect: {
    label: "Брак",
    bg: "bg-amber-100",
    text: "text-amber-700",
    sign: "−",
    qColor: "text-amber-700",
  },
};

const TX_TYPES = Object.keys(TYPE_CONFIG) as TxType[];

const DEFAULT_FILTERS: Filters = {
  type: "all",
  material_id: "all",
  dateFrom: "",
  dateTo: "",
};

const todayStr = () => new Date().toISOString().split("T")[0];

// ─── Helpers ──────────────────────────────────────────────

function fmtDate(s: string) {
  const [y, m, d] = s.split("-");
  return `${d}.${m}.${y}`;
}

function pluralRecords(n: number) {
  if (n % 10 === 1 && n % 100 !== 11) return "запись";
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100))
    return "записи";
  return "записей";
}

function computeBalances(txs: Transaction[]): BalanceData[] {
  const map = new Map<string, BalanceData>();
  for (const tx of txs) {
    if (!map.has(tx.material_id)) {
      map.set(tx.material_id, {
        material_id: tx.material_id,
        name: tx.material_name,
        unit: tx.material_unit,
        balance: 0,
        totalIn: 0,
        totalOut: 0,
      });
    }
    const b = map.get(tx.material_id)!;
    if (tx.type === "income" || tx.type === "return") {
      b.totalIn += tx.quantity;
      b.balance += tx.quantity;
    } else {
      b.totalOut += tx.quantity;
      b.balance -= tx.quantity;
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "ru")
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

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-[var(--card)] rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg z-10 max-h-[94dvh] flex flex-col">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 shrink-0 border-b border-[var(--border)]">
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
        <div className="px-6 py-5 overflow-y-auto">{children}</div>
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
  const selectedMaterial = materials.find((m) => m.id === form.material_id);
  const canSubmit =
    !!form.material_id &&
    !!form.quantity &&
    Number(form.quantity) > 0 &&
    Number(form.quantity) <= 999999999 &&
    !!form.date &&
    (!isDefect || !!form.defect_reason.trim());

  const inputCls =
    "w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm text-[var(--text)] bg-[var(--card)] focus:outline-none focus:ring-2 focus:ring-[#00f5c4]/20 focus:border-[#00f5c4] transition-colors";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
      className="space-y-4"
    >
      {/* Row: type + date */}
      <div className="grid grid-cols-2 gap-3">
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
        {materials.length === 0 ? (
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
              Сначала добавьте материалы в справочник
            </p>
          </div>
        ) : (
          <select
            value={form.material_id}
            onChange={set("material_id")}
            required
            className={inputCls}
          >
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.unit})
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Quantity */}
      <div>
        <label className="block text-sm font-medium text-[var(--muted)] mb-1.5">
          Количество{" "}
          {selectedMaterial && (
            <span className="text-[var(--muted)] font-normal">
              ({selectedMaterial.unit})
            </span>
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
        ) : (
          <p className="mt-1 text-xs text-[var(--muted)]">Макс. 999 999 999</p>
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
            className={`${inputCls} resize-none`}
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
          className={`${inputCls} resize-none`}
        />
      </div>

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

      {/* Buttons */}
      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="flex-1 py-2.5 px-4 rounded-lg border border-gray-300 text-sm font-medium text-[var(--muted)] hover:bg-[var(--bg3)] transition-colors disabled:opacity-50"
        >
          Отмена
        </button>
        <button
          type="submit"
          disabled={isPending || !canSubmit}
          className="flex-1 py-2.5 px-4 rounded-lg bg-[#00f5c4] hover:bg-[#00ddb3] text-[#0a0a0a] text-sm font-semibold text-white transition-colors disabled:opacity-60 flex items-center justify-center gap-2 min-h-[44px]"
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

// ─── Filter Bar ───────────────────────────────────────────

function FilterBar({
  filters,
  onChange,
  materials,
  hasActive,
  onClear,
}: {
  filters: Filters;
  onChange: (p: Partial<Filters>) => void;
  materials: Material[];
  hasActive: boolean;
  onClear: () => void;
}) {
  const selectCls =
    "w-full px-3 py-2 rounded-lg border border-gray-300 text-sm text-[var(--text)] bg-[var(--card)] focus:outline-none focus:ring-2 focus:ring-[#00f5c4]/20 focus:border-[#00f5c4] transition-colors";
  const labelCls = "block text-xs font-medium text-[var(--muted)] mb-1.5";

  return (
    <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-4 mb-5">
      <div className="flex flex-wrap gap-3 items-end">
        {/* Type */}
        <div className="flex-1 min-w-[120px]">
          <label className={labelCls}>Тип операции</label>
          <select
            value={filters.type}
            onChange={(e) =>
              onChange({ type: e.target.value as Filters["type"] })
            }
            className={selectCls}
          >
            <option value="all">Все типы</option>
            {TX_TYPES.map((k) => (
              <option key={k} value={k}>
                {TYPE_CONFIG[k].label}
              </option>
            ))}
          </select>
        </div>

        {/* Material */}
        <div className="flex-1 min-w-[150px]">
          <label className={labelCls}>Материал</label>
          <select
            value={filters.material_id}
            onChange={(e) => onChange({ material_id: e.target.value })}
            className={selectCls}
          >
            <option value="all">Все материалы</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        {/* Date from */}
        <div className="flex-1 min-w-[130px]">
          <label className={labelCls}>Дата с</label>
          <input
            type="date"
            value={filters.dateFrom}
            max={filters.dateTo || todayStr()}
            onChange={(e) => onChange({ dateFrom: e.target.value })}
            className={selectCls}
          />
        </div>

        {/* Date to */}
        <div className="flex-1 min-w-[130px]">
          <label className={labelCls}>Дата по</label>
          <input
            type="date"
            value={filters.dateTo}
            min={filters.dateFrom}
            max={todayStr()}
            onChange={(e) => onChange({ dateTo: e.target.value })}
            className={selectCls}
          />
        </div>

        {/* Clear */}
        {hasActive && (
          <button
            onClick={onClear}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-[var(--muted)] hover:bg-gray-100 border border-gray-300 transition-colors whitespace-nowrap"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Сбросить
          </button>
        )}
      </div>
    </div>
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
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#00f5c4] hover:bg-[#00ddb3] text-[#0a0a0a] text-white text-sm font-semibold rounded-xl transition-colors shadow-sm min-h-[44px]"
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
  initialBalances,
  page,
  totalPages,
  totalCount,
}: {
  transactions: Transaction[];
  materials: Material[];
  initialBalances?: BalanceData[];
  page?: number;
  totalPages?: number;
  totalCount?: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [modalOpen, setModalOpen] = useState(false);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [formError, setFormError] = useState("");

  // Use server-computed balances (full dataset) if provided, otherwise
  // fall back to client-side computation over current page's transactions.
  const balances = useMemo(
    () => initialBalances ?? computeBalances(transactions),
    [initialBalances, transactions]
  );

  const filtered = useMemo(() => {
    return transactions.filter((tx) => {
      if (filters.type !== "all" && tx.type !== filters.type) return false;
      if (
        filters.material_id !== "all" &&
        tx.material_id !== filters.material_id
      )
        return false;
      if (filters.dateFrom && tx.transaction_date < filters.dateFrom)
        return false;
      if (filters.dateTo && tx.transaction_date > filters.dateTo) return false;
      return true;
    });
  }, [transactions, filters]);

  const hasFilters = useMemo(
    () =>
      filters.type !== "all" ||
      filters.material_id !== "all" ||
      !!filters.dateFrom ||
      !!filters.dateTo,
    [filters]
  );

  const updateFilters = useCallback(
    (p: Partial<Filters>) => setFilters((prev) => ({ ...prev, ...p })),
    []
  );

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setFormError("");
  }, []);

  const handleAdd = useCallback(
    (form: FormState) => {
      setFormError("");
      startTransition(async () => {
        try {
          const noteToSave =
            form.type === "defect"
              ? form.defect_reason.trim() +
                (form.note.trim() ? `\n\n${form.note.trim()}` : "")
              : form.note.trim() || null;

          await createTransaction({
            type: form.type as TxType,
            material_id: form.material_id,
            quantity: parseFloat(form.quantity),
            note: noteToSave,
            transaction_date: form.date,
          });
          router.refresh();
          closeModal();
        } catch (e) {
          setFormError(
            e instanceof Error ? e.message : "Ошибка добавления записи"
          );
        }
      });
    },
    [router, closeModal]
  );

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">
            Движение материалов
          </h1>
          <p className="text-sm text-[var(--muted)] mt-0.5">
            {(totalCount ?? transactions.length) === 0
              ? "Записей нет"
              : `${totalCount ?? transactions.length} ${pluralRecords(totalCount ?? transactions.length)} всего`}
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#00f5c4] hover:bg-[#00ddb3] text-[#0a0a0a] text-white text-sm font-semibold rounded-xl transition-colors shadow-sm self-start sm:self-auto min-h-[44px]"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Добавить запись
        </button>
      </div>

      {/* ── Balance Cards ───────────────────────────────── */}
      {balances.length > 0 && <BalanceCard balances={balances} />}

      {/* ── Filters ─────────────────────────────────────── */}
      {transactions.length > 0 && (
        <FilterBar
          filters={filters}
          onChange={updateFilters}
          materials={materials}
          hasActive={hasFilters}
          onClear={() => setFilters(DEFAULT_FILTERS)}
        />
      )}

      {/* ── Count ───────────────────────────────────────── */}
      {hasFilters && filtered.length !== transactions.length && (
        <p className="text-sm text-[var(--muted)] mb-3">
          Показано{" "}
          <span className="font-semibold text-gray-800">{filtered.length}</span>{" "}
          из {transactions.length}
        </p>
      )}

      {/* ── Empty state ─────────────────────────────────── */}
      {filtered.length === 0 && (
        <EmptyState
          isFiltered={hasFilters && transactions.length > 0}
          onAdd={() => setModalOpen(true)}
        />
      )}

      {/* ── Desktop Table ───────────────────────────────── */}
      {filtered.length > 0 && (
        <>
          <div
            className={`hidden sm:block bg-[var(--card)] rounded-xl border border-[var(--border)] overflow-hidden transition-opacity ${
              isPending ? "opacity-60 pointer-events-none" : ""
            }`}
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--bg3)] border-b border-[var(--border)]">
                  {[
                    ["Дата", "w-24"],
                    ["Материал", ""],
                    ["Тип", "w-24"],
                    ["Количество", "w-36 text-right"],
                    ["Кто добавил", "w-36"],
                    ["Примечание", ""],
                  ].map(([label, cls]) => (
                    <th
                      key={label as string}
                      className={`px-5 py-3.5 text-left text-xs font-semibold text-[var(--muted)] uppercase tracking-wide ${cls}`}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {filtered.map((tx) => {
                  const cfg = TYPE_CONFIG[tx.type];
                  return (
                    <tr
                      key={tx.id}
                      className="hover:bg-[var(--bg3)] transition-colors"
                    >
                      <td className="px-5 py-3.5 text-[var(--muted)] text-xs tabular-nums whitespace-nowrap">
                        {fmtDate(tx.transaction_date)}
                      </td>
                      <td className="px-5 py-3.5 font-medium text-[var(--text)]">
                        {tx.material_name}
                      </td>
                      <td className="px-5 py-3.5">
                        <TypeBadge type={tx.type} />
                      </td>
                      <td
                        className={`px-5 py-3.5 text-right font-bold tabular-nums font-mono text-sm ${cfg.qColor}`}
                      >
                        {cfg.sign}
                        {formatQuantity(tx.quantity)}{" "}
                        <span className="text-xs font-normal text-[var(--muted)]">
                          {tx.material_unit}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-xs">
                        {tx.source === "whatsapp" ? (
                          <div className="flex items-center gap-1.5">
                            <svg className="w-3 h-3 shrink-0 text-[#25D366]" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                            </svg>
                            <span className="text-[var(--muted)]">{tx.creator_name}</span>
                          </div>
                        ) : (
                          <span className="text-[var(--muted)]">{tx.creator_name}</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-[var(--muted)] text-xs max-w-[180px]">
                        {tx.note ? (
                          <span
                            className="block truncate"
                            title={tx.note}
                          >
                            {tx.note}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Mobile Cards ──────────────────────────────── */}
          <div
            className={`sm:hidden space-y-3 transition-opacity ${
              isPending ? "opacity-60 pointer-events-none" : ""
            }`}
          >
            {filtered.map((tx) => {
              const cfg = TYPE_CONFIG[tx.type];
              return (
                <div
                  key={tx.id}
                  className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-4"
                >
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <TypeBadge type={tx.type} />
                    <span className="text-xs text-[var(--muted)] tabular-nums">
                      {fmtDate(tx.transaction_date)}
                    </span>
                  </div>

                  <p className="font-semibold text-[var(--text)] text-sm">
                    {tx.material_name}
                  </p>

                  <p
                    className={`text-xl font-bold tabular-nums mt-1 ${cfg.qColor}`}
                  >
                    {cfg.sign}
                    {formatQuantity(tx.quantity)}{" "}
                    <span className="text-sm font-normal text-[var(--muted)]">
                      {tx.material_unit}
                    </span>
                  </p>

                  {tx.note && (
                    <p className="text-xs text-[var(--muted)] mt-2 line-clamp-2 leading-relaxed">
                      {tx.note}
                    </p>
                  )}

                  <p className="text-xs text-[var(--muted)] mt-2 pt-2 border-t border-[var(--border)] flex items-center gap-1.5">
                    {tx.source === "whatsapp" && (
                      <svg className="w-3 h-3 shrink-0 text-[#25D366]" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                      </svg>
                    )}
                    {tx.creator_name}
                  </p>
                </div>
              );
            })}
          </div>
        </>
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
