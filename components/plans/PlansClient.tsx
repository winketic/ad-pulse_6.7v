"use client";

import {
  useState,
  useTransition,
  useMemo,
  useCallback,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createPlan, type PlanStatus } from "@/app/(dashboard)/dashboard/plans/actions";
import { formatCompact } from "@/lib/utils/format";
import { Modal, ModalBody, ModalFooter } from "@/components/ui/Modal";
// Minimal material shape needed for the plans form
export type PlanMaterial = {
  id: string;
  name: string;
  unit: string;
};

export type PlanUser = {
  id: string;
  full_name: string;
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
  assigned_to: string | null;
  items: { name: string; qty: number }[];
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
  assigned_to: string;
};

// ─── Helpers ──────────────────────────────────────────────

function fmtDate(s: string) {
  const [y, m, d] = s.split("-");
  return `${d}.${m}.${y}`;
}

function uid() {
  return Math.random().toString(36).slice(2);
}

// ─── Progress Ring — SVG circle with % inside ─────────────

function ProgressRing({ pct, tone }: { pct: number; tone: "accent" | "danger" | "success" }) {
  const R = 26;
  const C = 2 * Math.PI * R;
  const clamped = Math.min(pct, 100);
  const color =
    tone === "success" ? "var(--success)" : tone === "danger" ? "var(--danger)" : "var(--accent)";
  return (
    <div className="relative w-16 h-16 shrink-0" aria-label={`${pct.toFixed(0)}%`}>
      <svg viewBox="0 0 64 64" className="w-16 h-16 -rotate-90">
        <circle cx="32" cy="32" r={R} fill="none" stroke="var(--surface-3)" strokeWidth="6" />
        <circle
          cx="32"
          cy="32"
          r={R}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - clamped / 100)}
          style={{ transition: "stroke-dashoffset 600ms var(--ease-out)" }}
        />
      </svg>
      <span
        className="num absolute inset-0 flex items-center justify-center text-sm font-bold"
        style={{ color }}
      >
        {Math.min(pct, 999).toFixed(0)}%
      </span>
    </div>
  );
}

// ─── Plan card: ring left, meta right ─────────────────────

type PlanWithMeta = Plan & { pct: number; daysLeft: number };

function countdownLabel(p: PlanWithMeta): { text: string; cls: string } {
  if (p.status !== "active") {
    return { text: p.status === "completed" ? "завершён" : "отменён", cls: "text-[var(--muted-2)]" };
  }
  if (p.daysLeft < 0)
    return { text: `просрочен ${Math.abs(p.daysLeft)} дн`, cls: "text-[var(--danger)] font-bold uppercase" };
  if (p.daysLeft === 0) return { text: "дедлайн сегодня", cls: "text-[var(--warning)] font-bold uppercase" };
  if (p.daysLeft <= 3)
    return { text: `осталось ${p.daysLeft} дн`, cls: "text-[var(--warning)] font-bold" };
  return { text: `до ${fmtDate(p.end_date)} · ещё ${p.daysLeft} дн`, cls: "text-[var(--muted)]" };
}

function PlanCard({
  plan,
  index,
  tone,
  archived = false,
}: {
  plan: PlanWithMeta;
  index: number;
  tone: "accent" | "danger" | "success";
  archived?: boolean;
}) {
  const cd = countdownLabel(plan);
  const itemsLine = plan.items
    .slice(0, 3)
    .map((it) => `${it.name} ×${formatCompact(it.qty)}`)
    .join(" · ");
  const more = plan.items.length > 3 ? ` +${plan.items.length - 3}` : "";

  return (
    <Link
      href={`/dashboard/plans/${plan.id}`}
      className={`flex items-center gap-4 bg-[var(--surface-1)] rounded-2xl border p-4 transition-colors tap-scale fade-in-up hover:bg-[var(--surface-2)] ${
        tone === "danger" ? "border-[var(--danger)]/40" : "border-[var(--border)]"
      } ${archived ? "opacity-70" : ""}`}
      style={{ animationDelay: `${Math.min(index * 40, 320)}ms` }}
    >
      <ProgressRing pct={plan.pct} tone={plan.pct >= 100 ? "success" : tone} />

      <div className="flex-1 min-w-0">
        <h3 className="text-base font-semibold text-[var(--text)] leading-tight truncate">
          {plan.name}
        </h3>
        <p className={`text-xs mt-1 ${cd.cls}`}>{cd.text}</p>
        {itemsLine && (
          <p className="num text-[11px] text-[var(--muted)] mt-1.5 truncate">
            {itemsLine}
            {more}
          </p>
        )}
        <p className="num text-[11px] text-[var(--muted-2)] mt-0.5">
          {formatCompact(plan.actual_quantity)} / {formatCompact(plan.planned_quantity)}
        </p>
      </div>

      <svg className="w-4 h-4 text-[var(--muted-2)] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}


// ─── Create Plan Form ─────────────────────────────────────

function CreatePlanForm({
  materials,
  users,
  onSuccess,
  onCancel,
}: {
  materials: PlanMaterial[];
  users: PlanUser[];
  onSuccess: (id: string) => void;
  onCancel: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>({
    name: "",
    start_date: "",
    end_date: "",
    assigned_to: "",
  });
  const [rows, setRows] = useState<MatRow[]>([
    { uid: uid(), material_id: materials[0]?.id ?? "", quantity: "" },
  ]);
  const [error, setError] = useState("");

  const setField =
    (k: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
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
          assigned_to: form.assigned_to || null,
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
          <a href="/dashboard/materials" className="text-[var(--accent)] underline">
            справочник
          </a>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
      <ModalBody className="space-y-5">
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

      {/* Assignee */}
      <div>
        <label className="block text-sm font-medium text-[var(--muted)] mb-1.5">
          Исполнитель
          <span className="ml-1.5 text-xs font-normal text-[var(--muted)]">(необязательно)</span>
        </label>
        <select
          value={form.assigned_to}
          onChange={setField("assigned_to")}
          className={inputCls}
        >
          <option value="">Не назначен</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.full_name}
            </option>
          ))}
        </select>
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
          className="mt-2.5 flex items-center gap-1.5 text-sm text-[var(--accent)] hover:text-[var(--accent-hover)] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
      </ModalBody>

      <ModalFooter>
        <div className="flex gap-3">
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
            {isPending ? "Создание..." : "Создать план"}
          </button>
        </div>
      </ModalFooter>
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
      <div className="w-16 h-16 rounded-2xl bg-[var(--accent)]/8 flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-[var(--accent)]/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.4}>
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
        className="dp-btn-primary rounded-xl"
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
  users,
}: {
  plans: Plan[];
  materials: PlanMaterial[];
  users: PlanUser[];
}) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  // Zones: burning/overdue on top, then active, archive collapsed
  const zones = useMemo(() => {
    const withMeta = plans.map((p) => {
      const pct = p.planned_quantity > 0 ? (p.actual_quantity / p.planned_quantity) * 100 : 0;
      const daysLeft = Math.ceil(
        (new Date(p.end_date + "T23:59:59").getTime() - Date.now()) / (24 * 60 * 60 * 1000)
      );
      return { ...p, pct, daysLeft };
    });
    const overdue = withMeta.filter((p) => p.status === "active" && p.daysLeft < 0);
    const active = withMeta
      .filter((p) => p.status === "active" && p.daysLeft >= 0)
      .sort((a, b) => a.daysLeft - b.daysLeft);
    const archive = withMeta.filter((p) => p.status !== "active");
    return { overdue, active, archive };
  }, [plans]);

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
          <h1 className="text-display text-[var(--text)]">
            Производственные планы
          </h1>
          <p className="text-label mt-1.5">
            {plans.length === 0
              ? "Планов нет"
              : `${plans.length} план${plans.length === 1 ? "" : plans.length < 5 ? "а" : "ов"}`}
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="dp-btn-primary rounded-xl self-start sm:self-auto"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Новый план
        </button>
      </div>

      {/* ── Empty ───────────────────────────────────────── */}
      {plans.length === 0 && (
        <EmptyState onAdd={() => setModalOpen(true)} isFiltered={false} />
      )}

      {/* ── Zone: overdue — screams on top ──────────────── */}
      {zones.overdue.length > 0 && (
        <section className="mb-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--danger)] mb-2">
            ⛔ Горят ({zones.overdue.length})
          </p>
          <div className="space-y-2.5">
            {zones.overdue.map((plan, i) => (
              <PlanCard key={plan.id} plan={plan} index={i} tone="danger" />
            ))}
          </div>
        </section>
      )}

      {/* ── Zone: active ────────────────────────────────── */}
      {zones.active.length > 0 && (
        <section className="mb-5">
          {(zones.overdue.length > 0 || zones.archive.length > 0) && (
            <p className="text-label mb-2">Активные ({zones.active.length})</p>
          )}
          <div className="space-y-2.5">
            {zones.active.map((plan, i) => (
              <PlanCard key={plan.id} plan={plan} index={i} tone="accent" />
            ))}
          </div>
        </section>
      )}

      {/* ── Zone: archive — collapsed accordion ─────────── */}
      {zones.archive.length > 0 && (
        <section>
          <button
            onClick={() => setArchiveOpen((v) => !v)}
            className="flex items-center gap-1.5 text-label hover:text-[var(--text)] transition-colors mb-2"
          >
            Завершённые и отменённые ({zones.archive.length})
            <svg
              className={`w-3.5 h-3.5 transition-transform ${archiveOpen ? "rotate-180" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {archiveOpen && (
            <div className="space-y-2.5" style={{ animation: "fadeIn 150ms var(--ease) both" }}>
              {zones.archive.map((plan, i) => (
                <PlanCard key={plan.id} plan={plan} index={i} tone={plan.pct >= 100 ? "success" : "accent"} archived />
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Create Plan Modal ───────────────────────────── */}
      {modalOpen && (
        <Modal title="Новый производственный план" size="xl" onClose={() => setModalOpen(false)}>
          <CreatePlanForm
            materials={materials}
            users={users}
            onSuccess={handleCreated}
            onCancel={() => setModalOpen(false)}
          />
        </Modal>
      )}
    </div>
  );
}
