"use client";

import {
  useState,
  useTransition,
  useMemo,
  useCallback,
  useEffect,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createPlan, type PlanStatus } from "@/app/(dashboard)/dashboard/plans/actions";
import { formatCompact } from "@/lib/utils/format";
// Minimal material shape needed for the plans form
export type PlanMaterial = {
  id: string;
  name: string;
  unit: string;
};

// ─── Types ────────────────────────────────────────────────

export type Plan = {
  id: string;
  name: string;
  planned_quantity: number;
  actual_quantity: number;
  start_date: string;
  end_date: string;
  status: PlanStatus;
  created_at: string;
};

type MatRow = {
  uid: string;
  material_id: string;
  quantity: string;
};

type FormState = {
  name: string;
  start_date: string;
  end_date: string;
};

// ─── Config ───────────────────────────────────────────────

const STATUS_CFG: Record<
  PlanStatus,
  { label: string; bg: string; text: string; dot: string }
> = {
  active: {
    label: "Активный",
    bg: "bg-green-500/15 border border-green-500/20",
    text: "text-green-400",
    dot: "bg-green-400",
  },
  completed: {
    label: "Завершён",
    bg: "bg-blue-500/15 border border-blue-500/20",
    text: "text-blue-400",
    dot: "bg-blue-400",
  },
  cancelled: {
    label: "Отменён",
    bg: "bg-[var(--bg3)]",
    text: "text-[var(--muted)]",
    dot: "bg-gray-400",
  },
};

const TABS: { key: PlanStatus | "all"; label: string }[] = [
  { key: "all", label: "Все" },
  { key: "active", label: "Активные" },
  { key: "completed", label: "Завершённые" },
  { key: "cancelled", label: "Отменённые" },
];

// ─── Helpers ──────────────────────────────────────────────

function fmtDate(s: string) {
  const [y, m, d] = s.split("-");
  return `${d}.${m}.${y}`;
}

function uid() {
  return Math.random().toString(36).slice(2);
}

// ─── Status Badge ─────────────────────────────────────────

function StatusBadge({ status }: { status: PlanStatus }) {
  const c = STATUS_CFG[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${c.bg} ${c.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

// ─── Progress Bar ─────────────────────────────────────────

function ProgressBar({ pct }: { pct: number }) {
  const clamped = Math.min(pct, 100);
  const over = pct > 100;

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-[var(--bg3)] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            over ? "bg-red-500" : pct >= 75 ? "bg-[#00f5c4]" : "bg-[#00f5c4]"
          }`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span
        className={`text-xs tabular-nums font-medium w-10 text-right ${
          over ? "text-red-600" : "text-[var(--muted)]"
        }`}
      >
        {pct.toFixed(0)}%
      </span>
    </div>
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
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        onTouchMove={(e) => e.preventDefault()}
      />
      <div className="relative bg-[var(--card)] rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl z-10 max-h-[94dvh] flex flex-col">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 shrink-0 border-b border-[var(--border)]">
          <h2 className="text-lg font-semibold text-[var(--text)]">{title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--bg3)] text-[var(--muted)] hover:text-[var(--muted)] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto flex-1 min-h-0">{children}</div>
      </div>
    </div>
  );
}

// ─── Create Plan Form ─────────────────────────────────────

function CreatePlanForm({
  materials,
  onSuccess,
  onCancel,
}: {
  materials: PlanMaterial[];
  onSuccess: (id: string) => void;
  onCancel: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>({
    name: "",
    start_date: "",
    end_date: "",
  });
  const [rows, setRows] = useState<MatRow[]>([
    { uid: uid(), material_id: materials[0]?.id ?? "", quantity: "" },
  ]);
  const [error, setError] = useState("");

  const setField =
    (k: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  const addRow = () =>
    setRows((p) => [
      ...p,
      { uid: uid(), material_id: materials[0]?.id ?? "", quantity: "" },
    ]);

  const removeRow = (rowUid: string) =>
    setRows((p) => p.filter((r) => r.uid !== rowUid));

  const updateRow = (
    rowUid: string,
    field: "material_id" | "quantity",
    value: string
  ) =>
    setRows((p) =>
      p.map((r) => (r.uid === rowUid ? { ...r, [field]: value } : r))
    );

  const usedIds = new Set(rows.map((r) => r.material_id));
  const hasDuplicates = usedIds.size !== rows.length;

  const canSubmit =
    form.name.trim() &&
    form.start_date &&
    form.end_date &&
    form.end_date >= form.start_date &&
    rows.length > 0 &&
    rows.every((r) => r.material_id && r.quantity && Number(r.quantity) > 0) &&
    !hasDuplicates &&
    materials.length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      try {
        const id = await createPlan({
          name: form.name,
          start_date: form.start_date,
          end_date: form.end_date,
          materials: rows.map((r) => ({
            material_id: r.material_id,
            planned_quantity: parseFloat(r.quantity),
          })),
        });
        onSuccess(id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ошибка создания плана");
      }
    });
  };

  const inputCls = "field-input";

  if (materials.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        </div>
        <p className="text-sm font-medium text-[var(--text)]">Нет материалов в справочнике</p>
        <p className="text-sm text-[var(--muted)] mt-1">
          Сначала добавьте материалы в{" "}
          <a href="/dashboard/materials" className="text-[#00f5c4] underline">
            справочник
          </a>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Name */}
      <div>
        <label className="block text-sm font-medium text-[var(--muted)] mb-1.5">
          Название плана <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={form.name}
          onChange={setField("name")}
          placeholder="Производственный план Январь 2025"
          required
          maxLength={200}
          autoFocus
          className={inputCls}
        />
      </div>

      {/* Dates */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-[var(--muted)] mb-1.5">
            Дата начала <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={form.start_date}
            onChange={setField("start_date")}
            required
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--muted)] mb-1.5">
            Дата окончания <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={form.end_date}
            onChange={setField("end_date")}
            min={form.start_date}
            required
            className={inputCls}
          />
        </div>
      </div>

      {/* Materials */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-[var(--muted)]">
            Материалы плана <span className="text-red-500">*</span>
          </label>
          {hasDuplicates && (
            <span className="text-xs text-red-600">Повторяющиеся материалы</span>
          )}
        </div>

        <div className="space-y-2">
          {rows.map((row, idx) => {
            const isDuplicate =
              rows.filter((r) => r.material_id === row.material_id).length > 1;
            return (
              <div
                key={row.uid}
                className={`flex items-center gap-2 p-2.5 rounded-lg border ${
                  isDuplicate ? "border-red-300 bg-red-50" : "border-[var(--border)] bg-[var(--bg3)]"
                }`}
              >
                {/* Row number */}
                <span className="text-xs font-medium text-[var(--muted)] w-5 text-center shrink-0">
                  {idx + 1}
                </span>

                {/* Material select */}
                <select
                  value={row.material_id}
                  onChange={(e) => updateRow(row.uid, "material_id", e.target.value)}
                  className="field-input flex-1 min-w-0"
                >
                  {materials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.unit})
                    </option>
                  ))}
                </select>

                {/* Quantity */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <input
                    type="number"
                    value={row.quantity}
                    onChange={(e) => updateRow(row.uid, "quantity", e.target.value)}
                    placeholder="0.00"
                    min="0.0001"
                    step="0.0001"
                    className="field-input w-28 text-right"
                  />
                  <span className="text-xs text-[var(--muted)] w-10 truncate">
                    {materials.find((m) => m.id === row.material_id)?.unit ?? ""}
                  </span>
                </div>

                {/* Remove */}
                <button
                  type="button"
                  onClick={() => removeRow(row.uid)}
                  disabled={rows.length === 1}
                  className="p-1 rounded-lg text-[var(--muted)] hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                  title="Удалить строку"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={addRow}
          disabled={rows.length >= materials.length}
          className="mt-2.5 flex items-center gap-1.5 text-sm text-[#00f5c4] hover:text-[#163d24] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Добавить материал
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-red-50 border border-red-200">
          <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <span className="text-sm text-red-700">{error}</span>
        </div>
      )}

      {/* Buttons — sticky to bottom of scroll area so they're always reachable without scrolling */}
      <div className="flex gap-3 pt-3 sticky bottom-0 -mx-6 -mb-5 px-6 pb-[calc(80px+env(safe-area-inset-bottom,0px))] sm:pb-5 bg-[var(--card)] border-t border-[var(--border)]">
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
          className="flex-1 py-2.5 px-4 rounded-lg bg-[#00f5c4] hover:bg-[#163d24] text-sm font-semibold text-white transition-colors disabled:opacity-60 flex items-center justify-center gap-2 min-h-[48px]"
        >
          {isPending && (
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {isPending ? "Создание..." : "Создать план"}
        </button>
      </div>
    </form>
  );
}

// ─── Empty state ──────────────────────────────────────────

function EmptyState({
  onAdd,
  isFiltered,
}: {
  onAdd: () => void;
  isFiltered: boolean;
}) {
  if (isFiltered)
    return (
      <div className="text-center py-16">
        <p className="text-sm text-[var(--muted)]">Нет планов с этим статусом</p>
      </div>
    );

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-[#00f5c4]/8 flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-[#00f5c4]/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.4}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
      </div>
      <h3 className="text-base font-semibold text-[var(--text)] mb-1">
        Планов пока нет
      </h3>
      <p className="text-sm text-[var(--muted)] mb-6 max-w-xs">
        Создайте производственный план и привяжите к нему материалы
      </p>
      <button
        onClick={onAdd}
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#00f5c4] hover:bg-[#163d24] text-white text-sm font-semibold rounded-xl transition-colors shadow-sm min-h-[48px]"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        Создать план
      </button>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────

export default function PlansClient({
  plans,
  materials,
}: {
  plans: Plan[];
  materials: PlanMaterial[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<PlanStatus | "all">("all");
  const [modalOpen, setModalOpen] = useState(false);

  const counts = useMemo(() => {
    const c: Record<PlanStatus | "all", number> = {
      all: plans.length,
      active: 0,
      completed: 0,
      cancelled: 0,
    };
    for (const p of plans) c[p.status]++;
    return c;
  }, [plans]);

  const filtered = useMemo(
    () => (tab === "all" ? plans : plans.filter((p) => p.status === tab)),
    [plans, tab]
  );

  const handleCreated = useCallback(
    (id: string) => {
      setModalOpen(false);
      router.push(`/dashboard/plans/${id}`);
    },
    [router]
  );

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">
            Производственные планы
          </h1>
          <p className="text-sm text-[var(--muted)] mt-0.5">
            {plans.length === 0
              ? "Планов нет"
              : `${plans.length} план${plans.length === 1 ? "" : plans.length < 5 ? "а" : "ов"}`}
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#00f5c4] hover:bg-[#163d24] text-white text-sm font-semibold rounded-xl transition-colors shadow-sm self-start sm:self-auto min-h-[48px]"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Новый план
        </button>
      </div>

      {/* ── Status tabs ─────────────────────────────────── */}
      {plans.length > 0 && (
        <div className="flex items-center gap-1 bg-[var(--bg3)] rounded-xl p-1 mb-6 w-fit">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                tab === t.key
                  ? "bg-[var(--card)] text-[var(--text)] shadow-sm"
                  : "text-[var(--muted)] hover:text-[var(--muted)]"
              }`}
            >
              {t.label}
              {counts[t.key] > 0 && (
                <span
                  className={`ml-1.5 text-xs ${
                    tab === t.key ? "text-[var(--muted)]" : "text-[var(--muted)]"
                  }`}
                >
                  {counts[t.key]}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── Empty ───────────────────────────────────────── */}
      {filtered.length === 0 && (
        <EmptyState
          onAdd={() => setModalOpen(true)}
          isFiltered={tab !== "all" && plans.length > 0}
        />
      )}

      {/* ── Plans list ─────────────────────────────────── */}
      {filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((plan) => {
            const pct =
              plan.planned_quantity > 0
                ? (plan.actual_quantity / plan.planned_quantity) * 100
                : 0;

            return (
              <div
                key={plan.id}
                className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-5 hover:shadow-sm transition-shadow"
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  {/* Left */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <StatusBadge status={plan.status} />
                      <span className="text-xs text-[var(--muted)]">
                        {fmtDate(plan.start_date)} — {fmtDate(plan.end_date)}
                      </span>
                    </div>
                    <h3 className="text-base font-semibold text-[var(--text)] leading-tight">
                      {plan.name}
                    </h3>

                    {/* Progress */}
                    <div className="mt-3 max-w-xs">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-[var(--muted)]">Прогресс выполнения</span>
                      </div>
                      <ProgressBar pct={pct} />
                      <p className="text-xs text-[var(--muted)] mt-1">
                        Факт:{" "}
                        <span className="text-[var(--muted)] font-medium">
                          {formatCompact(plan.actual_quantity)}
                        </span>{" "}
                        / План:{" "}
                        <span className="text-[var(--muted)] font-medium">
                          {formatCompact(plan.planned_quantity)}
                        </span>
                      </p>
                    </div>
                  </div>

                  {/* Right: link */}
                  <Link
                    href={`/dashboard/plans/${plan.id}`}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-[var(--muted)] hover:bg-[var(--bg3)] hover:border-[#1a472a] hover:text-[#00f5c4] transition-colors self-start shrink-0"
                  >
                    Открыть
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Create Plan Modal ───────────────────────────── */}
      {modalOpen && (
        <Modal title="Новый производственный план" onClose={() => setModalOpen(false)}>
          <CreatePlanForm
            materials={materials}
            onSuccess={handleCreated}
            onCancel={() => setModalOpen(false)}
          />
        </Modal>
      )}
    </div>
  );
}
