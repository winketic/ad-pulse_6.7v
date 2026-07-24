"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import "driver.js/dist/driver.css";

// localStorage fallback so the tour never re-fires before the DB write
// lands (or if the tour_completed column doesn't exist yet).
const TOUR_KEY = "ad_pulse_tour_done";
// Custom event DashboardShell dispatches to (re)launch the tour manually.
export const TOUR_EVENT = "adpulse:start-tour";
// sessionStorage flag set when "Обучение" is clicked from another page —
// picked up once we land on /dashboard.
const FORCE_KEY = "adpulse_force_tour";

type Side = "top" | "bottom" | "left" | "right";

interface StepDef {
  /** data-tour attribute value; null → centered popover with no highlight */
  tour: string | null;
  title: string;
  description: string;
  /** roles that should SEE this step; omit = everyone */
  roles?: string[];
}

// Roles with real access to production plans. workshop/warehouse skip the
// Планы step per spec ("не показывать шаги про Планы если нет доступа").
const PLANS_ROLES = ["admin", "manager"];

const STEP_DEFS: StepDef[] = [
  {
    tour: null,
    title: "Добро пожаловать 👋",
    description: "Это AD Pulse — здесь виден весь учёт вашего производства.",
  },
  {
    tour: "hero-output",
    title: "Выпуск сегодня",
    description: "Сколько произвели сегодня — главная цифра дня.",
  },
  {
    tour: "stock",
    title: "Остатки",
    description: "Остатки сырья и продукции в реальном времени, цветом — статус: зелёный норма, жёлтый мало, красный критично.",
  },
  {
    tour: "activity",
    title: "Активность",
    description: "Кто и что внёс за день — живая лента операций.",
  },
  {
    tour: "produce",
    title: "Записать выпуск",
    description: "Самое частое действие — записать выпуск. Выбираешь перемычку, вводишь количество, сырьё спишется автоматически по нормам.",
  },
  {
    tour: "nav-warehouse",
    title: "Склад",
    description: "Все остатки, критичные — сверху.",
  },
  {
    tour: "nav-transactions",
    title: "Движение",
    description: "Приход, расход, брак — вся история.",
  },
  {
    tour: "nav-plans",
    title: "Планы",
    description: "Производственные планы с прогрессом и дедлайнами.",
    roles: PLANS_ROLES,
  },
  {
    tour: null,
    title: "Готово 🎉",
    description: "Готово. Если что-то непонятно — пишите нам, поможем.",
  },
];

/** First on-screen (rendered + visible) element matching the data-tour name. */
function pickVisible(name: string): HTMLElement | null {
  const els = Array.from(
    document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)
  );
  return els.find((el) => el.getClientRects().length > 0) ?? null;
}

interface OnboardingTourProps {
  role?: string | null;
  /** true → auto-launch on first dashboard visit */
  autoStart?: boolean;
}

export default function OnboardingTour({ role, autoStart }: OnboardingTourProps) {
  const pathname = usePathname();
  const runningRef = useRef(false);

  useEffect(() => {
    if (pathname !== "/dashboard") return;
    if (typeof window === "undefined") return;

    let cancelled = false;
    let driverInstance: { drive: () => void; destroy: () => void } | null = null;
    let startTimer: ReturnType<typeof setTimeout> | null = null;

    async function markDone() {
      try { localStorage.setItem(TOUR_KEY, "1"); } catch { /* ignore */ }
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        // Column may not exist before the migration is applied — ignore errors.
        if (user) await supabase.from("profiles").update({ tour_completed: true }).eq("id", user.id);
      } catch { /* ignore */ }
    }

    async function launch() {
      if (cancelled || runningRef.current) return;
      runningRef.current = true;

      const { driver } = await import("driver.js");
      if (cancelled) { runningRef.current = false; return; }

      // Resolve steps against the DOM for the CURRENT viewport (mobile and
      // desktop render different trees). Drop highlight steps whose target
      // isn't on screen; keep the centered welcome/final steps always.
      const steps = STEP_DEFS
        .filter((def) => !def.roles || (role != null && def.roles.includes(role)))
        .map((def) => {
          if (!def.tour) {
            return { popover: { title: def.title, description: def.description } };
          }
          const el = pickVisible(def.tour);
          if (!el) return null;
          const rect = el.getBoundingClientRect();
          const side: Side = rect.top < window.innerHeight / 2 ? "bottom" : "top";
          return {
            element: el,
            popover: { title: def.title, description: def.description, side, align: "center" as const },
          };
        })
        .filter((s): s is NonNullable<typeof s> => s !== null);

      if (steps.length === 0) { runningRef.current = false; return; }

      driverInstance = driver({
        popoverClass: "adpulse-tour",
        animate: true,
        overlayColor: "#0A0C10",
        overlayOpacity: 0.72,
        showProgress: true,
        progressText: "{{current}} из {{total}}",
        nextBtnText: "Далее →",
        prevBtnText: "← Назад",
        doneBtnText: "Готово",
        allowClose: true,
        steps,
        // Inject an explicit "Пропустить" button into every popover footer.
        onPopoverRender: (popover: { footerButtons?: HTMLElement }) => {
          if (!popover.footerButtons) return;
          if (popover.footerButtons.querySelector(".adpulse-skip-btn")) return;
          const skip = document.createElement("button");
          skip.innerText = "Пропустить";
          skip.className = "adpulse-skip-btn";
          skip.addEventListener("click", () => driverInstance?.destroy());
          popover.footerButtons.insertBefore(skip, popover.footerButtons.firstChild);
        },
        onDestroyStarted: () => {
          void markDone();
          driverInstance?.destroy();
          runningRef.current = false;
        },
      });

      // Let the dashboard finish painting its nav + cards first.
      startTimer = setTimeout(() => driverInstance?.drive(), 500);
    }

    // ── Trigger sources ─────────────────────────────────────
    // 1) forced from another page via "Обучение"
    let forced = false;
    try {
      if (sessionStorage.getItem(FORCE_KEY)) {
        sessionStorage.removeItem(FORCE_KEY);
        forced = true;
      }
    } catch { /* ignore */ }

    // 2) manual re-launch on the same page
    const onEvent = () => { void launch(); };
    window.addEventListener(TOUR_EVENT, onEvent);

    // 3) auto-start on first visit
    let tourDone = false;
    try { tourDone = !!localStorage.getItem(TOUR_KEY); } catch { /* ignore */ }

    if (forced || (autoStart && !tourDone)) {
      void launch();
    }

    return () => {
      cancelled = true;
      window.removeEventListener(TOUR_EVENT, onEvent);
      if (startTimer) clearTimeout(startTimer);
      driverInstance?.destroy();
      runningRef.current = false;
    };
  }, [pathname, role, autoStart]);

  return null;
}
