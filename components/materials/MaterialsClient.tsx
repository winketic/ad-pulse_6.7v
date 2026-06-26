"use client";

import {
  useState,
  useTransition,
  useMemo,
  useCallback,
  useEffect,
} from "react";
import { useRouter } from "next/navigation";
import {
  createMaterial,
  updateMaterial,
  deleteMaterial,
} from "@/app/(dashboard)/dashboard/materials/actions";

// ─── Types ────────────────────────────────────────────────

export type Material = {
  id: string;
  name: string;
  unit: string;
  gost_norm: number | null;
  created_at: string;
};

type FormState = {
  name: string;
  unit: string;
  gost_norm: string;
};

const UNITS = ["кг", "тонна", "шт", "м3", "литр", "м2"] as const;
const EMPTY_FORM: FormState = { name: "", unit: "кг", gost_norm: "" };

function toFormState(m?: Material | null): FormState {
  if (!m) return EMPTY_FORM;
  return {
    name: m.name,
    unit: m.unit,
    gost_norm: m.gost_norm != null ? String(m.gost_norm) : "",
  };
}

// ─── Helpers ──────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatGost(n: number | null) {
  return n != null ? n.toFixed(4) : "—";
}

function pluralMaterials(n: number) {
  if (n % 10 === 1 && n % 100 !== 11) return "позиция";
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100))
    return "позиции";
  return "позиций";
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
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
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
      <div className="relative bg-[var(--card)] w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-md sm:rounded-2xl shadow-2xl z-10 flex flex-col">
        {/* Modal header */}
        <div
          className="flex items-center justify-between px-4 shrink-0"
          style={{ minHeight: "56px", paddingTop: "env(safe-area-inset-top, 0px)" }}
        >
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
        <div className="p-4 overflow-y-auto flex-1 min-h-0">{children}</div>
      </div>
    </div>
  );
}

// ─── Material Form ────────────────────────────────────────

function MaterialForm({
  initialValues,
  onSubmit,
  onCancel,
  isPending,
  error,
  submitLabel,
}: {
  initialValues: FormState;
  onSubmit: (form: FormState) => void;
  onCancel: () => void;
  isPending: boolean;
  error: string;
  submitLabel: string;
}) {
  const [form, setForm] = useState<FormState>(initialValues);

  const set =
    (field: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));

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
      {/* Name */}
      <div>
        <label
          htmlFor="mat-name"
          className="block text-sm font-medium text-[var(--muted)] mb-1.5"
        >
          Название{" "}
          <span className="text-red-500" aria-hidden>
            *
          </span>
        </label>
        <input
          id="mat-name"
          type="text"
          value={form.name}
          onChange={set("name")}
          placeholder="Например: Сталь листовая"
          required
          maxLength={200}
          autoFocus
          className="field-input"
        />
      </div>

      {/* Unit */}
      <div>
        <label
          htmlFor="mat-unit"
          className="block text-sm font-medium text-[var(--muted)] mb-1.5"
        >
          Единица измерения{" "}
          <span className="text-red-500" aria-hidden>
            *
          </span>
        </label>
        <select
          id="mat-unit"
          value={form.unit}
          onChange={set("unit")}
          className="field-input"
        >
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </div>

      {/* GOST norm */}
      <div>
        <label
          htmlFor="mat-gost"
          className="block text-sm font-medium text-[var(--muted)] mb-1.5"
        >
          Норма расхода по ГОСТ
          <span className="ml-1.5 text-xs font-normal text-[var(--muted)]">
            (необязательно)
          </span>
        </label>
        <input
          id="mat-gost"
          type="number"
          value={form.gost_norm}
          onChange={set("gost_norm")}
          placeholder="0.0000"
          min="0"
          step="0.0001"
          className="field-input"
        />
        <p className="mt-1.5 text-xs text-[var(--muted)]">
          Нормативный расход согласно технической документации ГОСТа
        </p>
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
          disabled={isPending || !form.name.trim()}
          className="flex-1 py-2.5 px-4 rounded-lg bg-[#00f5c4] hover:bg-[#163d24] text-sm font-semibold text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-[48px]"
        >
          {isPending && (
            <svg
              className="animate-spin h-4 w-4 text-white"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          )}
          {isPending ? "Сохранение..." : submitLabel}
        </button>
      </div>
    </form>
  );
}

// ─── Empty State ──────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-[#00f5c4]/8 flex items-center justify-center mb-4">
        <svg
          className="w-8 h-8 text-[#00f5c4]/40"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.4}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
          />
        </svg>
      </div>
      <h3 className="text-base font-semibold text-[var(--text)] mb-1">
        Справочник пуст
      </h3>
      <p className="text-sm text-[var(--muted)] mb-6 max-w-xs">
        Добавьте первый материал, чтобы начать вести учёт прихода и расхода
      </p>
      <button
        onClick={onAdd}
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#00f5c4] hover:bg-[#163d24] text-white text-sm font-semibold rounded-xl transition-colors shadow-sm min-h-[48px]"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 4v16m8-8H4"
          />
        </svg>
        Добавить материал
      </button>
    </div>
  );
}

// ─── Action buttons (inline delete confirm) ───────────────

function RowActions({
  onEdit,
  onDelete,
  isPending,
}: {
  onEdit: () => void;
  onDelete: () => void;
  isPending: boolean;
}) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-[var(--muted)] hidden sm:inline">Удалить?</span>
        <button
          onClick={onDelete}
          disabled={isPending}
          className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50"
        >
          {isPending ? "..." : "Да"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={isPending}
          className="px-2.5 py-1 rounded-lg text-xs font-medium border border-gray-300 hover:bg-[var(--bg3)] text-[var(--muted)] transition-colors"
        >
          Нет
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <button
        onClick={onEdit}
        className="p-1.5 rounded-lg text-[var(--muted)] hover:bg-[var(--bg3)] hover:text-[#00f5c4] transition-colors"
        title="Редактировать"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
          />
        </svg>
      </button>
      <button
        onClick={() => setConfirming(true)}
        className="p-1.5 rounded-lg text-[var(--muted)] hover:bg-red-50 hover:text-red-600 transition-colors"
        title="Удалить"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
          />
        </svg>
      </button>
    </div>
  );
}

// ─── Mobile card ──────────────────────────────────────────

function MobileCard({
  material,
  onEdit,
  onDelete,
  isPending,
}: {
  material: Material;
  onEdit: () => void;
  onDelete: () => void;
  isPending: boolean;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-[var(--text)] text-sm leading-tight">
            {material.name}
          </h3>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#00f5c4]/10 text-[#00f5c4]">
              {material.unit}
            </span>
            {material.gost_norm != null && (
              <span className="text-xs text-[var(--muted)] tabular-nums">
                ГОСТ: {formatGost(material.gost_norm)}
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--muted)] mt-1.5">
            {formatDate(material.created_at)}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onEdit}
            className="p-2 rounded-lg text-[var(--muted)] hover:bg-[var(--bg3)] hover:text-[#00f5c4] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={() => setConfirming(true)}
            className="p-2 rounded-lg text-[var(--muted)] hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {confirming && (
        <div className="mt-3 pt-3 border-t border-[var(--border)] flex items-center justify-between gap-3">
          <p className="text-sm text-[var(--muted)]">Удалить «{material.name}»?</p>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => setConfirming(false)}
              className="px-3 py-1.5 rounded-lg text-sm border border-gray-300 hover:bg-[var(--bg3)] text-[var(--muted)] transition-colors"
            >
              Нет
            </button>
            <button
              onClick={onDelete}
              disabled={isPending}
              className="px-3 py-1.5 rounded-lg text-sm bg-red-600 hover:bg-red-700 text-white font-medium transition-colors disabled:opacity-50"
            >
              {isPending ? "..." : "Удалить"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────

import { ImportButton } from "./ImportButton";

export default function MaterialsClient({
  materials,
  canImport = false,
}: {
  materials: Material[];
  canImport?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [search, setSearch] = useState("");
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [formError, setFormError] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? materials.filter((m) => m.name.toLowerCase().includes(q))
      : materials;
  }, [materials, search]);

  const openCreate = useCallback(() => {
    setEditingMaterial(null);
    setFormError("");
    setModalMode("create");
  }, []);

  const openEdit = useCallback((m: Material) => {
    setEditingMaterial(m);
    setFormError("");
    setModalMode("edit");
  }, []);

  const closeModal = useCallback(() => {
    setModalMode(null);
    setEditingMaterial(null);
    setFormError("");
  }, []);

  const handleCreate = useCallback(
    (form: FormState) => {
      setFormError("");
      startTransition(async () => {
        try {
          await createMaterial({
            name: form.name,
            unit: form.unit,
            gost_norm: form.gost_norm ? parseFloat(form.gost_norm) : null,
          });
          router.refresh();
          closeModal();
        } catch (e) {
          setFormError(e instanceof Error ? e.message : "Ошибка создания");
        }
      });
    },
    [router, closeModal]
  );

  const handleUpdate = useCallback(
    (form: FormState) => {
      if (!editingMaterial) return;
      setFormError("");
      startTransition(async () => {
        try {
          await updateMaterial(editingMaterial.id, {
            name: form.name,
            unit: form.unit,
            gost_norm: form.gost_norm ? parseFloat(form.gost_norm) : null,
          });
          router.refresh();
          closeModal();
        } catch (e) {
          setFormError(e instanceof Error ? e.message : "Ошибка обновления");
        }
      });
    },
    [editingMaterial, router, closeModal]
  );

  const handleDelete = useCallback(
    (id: string) => {
      startTransition(async () => {
        try {
          await deleteMaterial(id);
          router.refresh();
        } catch (e) {
          console.error("Delete failed:", e);
        }
      });
    },
    [router]
  );

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* ── Page Header ─────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Материалы</h1>
          <p className="text-sm text-[var(--muted)] mt-0.5">
            {materials.length === 0
              ? "Справочник пуст"
              : `${materials.length} ${pluralMaterials(materials.length)}`}
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#00f5c4] hover:bg-[#163d24] text-white text-sm font-semibold rounded-xl transition-colors shadow-sm self-start sm:self-auto min-h-[48px]"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4v16m8-8H4"
            />
          </svg>
          Добавить материал
        </button>
        {canImport && <ImportButton />}
      </div>

      {/* ── Search ──────────────────────────────────── */}
      {materials.length > 0 && (
        <div className="relative mb-5">
          <svg
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)] pointer-events-none"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по названию..."
            className="w-full sm:max-w-sm pl-10 pr-9 py-2.5 rounded-xl border border-gray-300 text-sm text-[var(--text)] placeholder-gray-400 bg-[var(--card)] focus:outline-none focus:ring-2 focus:ring-[#00f5c4]/20 focus:border-[#00f5c4] transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded text-[var(--muted)] hover:text-[var(--muted)] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* ── Empty state ─────────────────────────────── */}
      {materials.length === 0 && <EmptyState onAdd={openCreate} />}

      {/* ── No search results ────────────────────────── */}
      {materials.length > 0 && filtered.length === 0 && (
        <div className="text-center py-16">
          <div className="w-12 h-12 rounded-xl bg-[var(--bg3)] flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-[var(--muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <p className="text-sm text-[var(--muted)] font-medium">
            Ничего не найдено
          </p>
          <p className="text-sm text-[var(--muted)] mt-0.5 mb-3">
            По запросу «{search}» результатов нет
          </p>
          <button
            onClick={() => setSearch("")}
            className="text-sm text-[#00f5c4] hover:underline font-medium"
          >
            Сбросить поиск
          </button>
        </div>
      )}

      {/* ── Desktop table ────────────────────────────── */}
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
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">
                    Название
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-[var(--muted)] uppercase tracking-wide w-28">
                    Ед. изм.
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-[var(--muted)] uppercase tracking-wide w-36">
                    Норма ГОСТ
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-[var(--muted)] uppercase tracking-wide w-36">
                    Добавлен
                  </th>
                  <th className="px-5 py-3.5 w-28" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {filtered.map((m) => (
                  <tr
                    key={m.id}
                    className="hover:bg-[var(--bg3)] transition-colors group"
                  >
                    <td className="px-5 py-3.5 font-medium text-[var(--text)]">
                      {m.name}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#00f5c4]/10 text-[#00f5c4]">
                        {m.unit}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-[var(--muted)] tabular-nums font-mono text-xs">
                      {formatGost(m.gost_norm)}
                    </td>
                    <td className="px-5 py-3.5 text-[var(--muted)]">
                      {formatDate(m.created_at)}
                    </td>
                    <td className="px-5 py-3.5">
                      <RowActions
                        onEdit={() => openEdit(m)}
                        onDelete={() => handleDelete(m.id)}
                        isPending={isPending}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Mobile cards ─────────────────────────── */}
          <div
            className={`sm:hidden space-y-3 transition-opacity ${
              isPending ? "opacity-60 pointer-events-none" : ""
            }`}
          >
            {filtered.map((m) => (
              <MobileCard
                key={m.id}
                material={m}
                onEdit={() => openEdit(m)}
                onDelete={() => handleDelete(m.id)}
                isPending={isPending}
              />
            ))}
          </div>
        </>
      )}

      {/* ── Add / Edit Modal ─────────────────────────── */}
      {modalMode !== null && (
        <Modal
          title={
            modalMode === "create" ? "Добавить материал" : "Редактировать материал"
          }
          onClose={closeModal}
        >
          <MaterialForm
            initialValues={toFormState(editingMaterial)}
            onSubmit={modalMode === "create" ? handleCreate : handleUpdate}
            onCancel={closeModal}
            isPending={isPending}
            error={formError}
            submitLabel={modalMode === "create" ? "Добавить" : "Сохранить"}
          />
        </Modal>
      )}
    </div>
  );
}
