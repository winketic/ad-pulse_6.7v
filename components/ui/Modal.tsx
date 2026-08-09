"use client";

import { useEffect, type ReactNode } from "react";

/**
 * One modal shell for the whole app. Layout is a strict flex column bounded to
 * the viewport height:
 *
 *   ┌ header  (shrink-0, always visible)
 *   ├ body    (flex-1, min-h-0, overflow-y-auto — the ONLY thing that scrolls)
 *   └ footer  (shrink-0, always visible, safe-area padded)
 *
 * Because the footer is a real flex sibling (not a `sticky`/absolute element
 * layered over the body) it can never overlap the last field — the root cause
 * of the clipped-modal bug. On mobile it's a bottom sheet; on ≥sm a centred
 * card. Compose with <ModalBody> and <ModalFooter>; a form should wrap them and
 * carry `className="flex flex-col flex-1 min-h-0"` so it fills the shell.
 */

const SIZES: Record<string, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
  xl: "sm:max-w-2xl",
};

export function Modal({
  title,
  onClose,
  children,
  size = "lg",
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4"
      style={{ height: "100dvh" }}
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        onTouchMove={(e) => e.preventDefault()}
      />
      <div
        className={`relative z-10 flex flex-col w-full ${SIZES[size]} bg-[var(--card)] shadow-2xl overflow-hidden rounded-t-2xl sm:rounded-2xl`}
        // Cap to the viewport so header+footer stay on screen and the body scrolls.
        style={{ maxHeight: "calc(100dvh - env(safe-area-inset-top, 0px))" }}
      >
        <div
          className="flex items-center justify-between gap-3 px-4 shrink-0 border-b border-[var(--border)]"
          style={{ minHeight: 56, paddingTop: "env(safe-area-inset-top, 0px)" }}
        >
          <h2 className="text-lg font-semibold text-[var(--text)] truncate min-w-0">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="shrink-0 p-1.5 rounded-lg text-[var(--muted)] hover:bg-[var(--surface-2)] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body slot — children fill it. A <form> child should be
            `flex flex-col flex-1 min-h-0` and hold <ModalBody>/<ModalFooter>. */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{children}</div>
      </div>
    </div>
  );
}

/** Scrolling content region. The only scrollable part of the modal. */
export function ModalBody({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 ${className}`}>
      {children}
    </div>
  );
}

/** Fixed footer — never overlaps the body; safe-area padded on mobile. */
export function ModalFooter({ children }: { children: ReactNode }) {
  return (
    <div
      className="shrink-0 border-t border-[var(--border)] bg-[var(--card)] px-4 pt-3"
      style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
    >
      {children}
    </div>
  );
}
