"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import type { DriveStep } from "driver.js";
import "driver.js/dist/driver.css";

const TOUR_KEY = "ad_pulse_tour_done";

// Steps mirror the real desktop header: two nav tabs, the primary action and
// the profile menu. Материалы/WhatsApp/Настройки живут в меню профиля, поэтому
// якоря у них нет — о них рассказывает финальный шаг без element, который
// driver.js показывает по центру экрана.
const STEPS: DriveStep[] = [
  {
    element: "#tour-nav-overview",
    popover: {
      title: "Обзор",
      description: "Остатки, движение за день и быстрые показатели по вашему складу.",
      side: "bottom",
      align: "start",
    },
  },
  {
    element: "#tour-nav-transactions",
    popover: {
      title: "Движение",
      description: "Все операции: приход, расход, брак, возврат. Фильтры и экспорт в Excel.",
      side: "bottom",
      align: "start",
    },
  },
  {
    element: "#tour-primary-action",
    popover: {
      title: "Выпуск",
      description: "Основное действие: выпуск или движение. На телефоне — центральная кнопка внизу.",
      side: "bottom",
      align: "end",
    },
  },
  {
    element: "#tour-user-menu",
    popover: {
      title: "Профиль",
      description: "Меню профиля: Материалы, WhatsApp, Настройки и выход.",
      side: "bottom",
      align: "end",
    },
  },
  {
    // No element — driver.js centers this closing popover.
    popover: {
      title: "Всё под рукой",
      description:
        "Материалы, WhatsApp, Настройки и приглашения — в меню профиля. На телефоне они в нижней навигации и кнопке «Ещё».",
    },
  },
];

export default function OnboardingTour() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/dashboard") return;
    if (typeof window === "undefined") return;
    // ?tour=1 replays the tour on demand (support, QA, demos): without it the
    // flag would keep it hidden forever once dismissed.
    const replay = new URLSearchParams(window.location.search).get("tour") === "1";
    if (!replay && localStorage.getItem(TOUR_KEY)) return;
    if (window.innerWidth < 1024) return;

    let driverInstance: { drive: () => void; destroy: () => void } | null = null;
    let cancelled = false;

    import("driver.js").then(({ driver }) => {
      if (cancelled) return;
      // Skip steps whose target element isn't in the DOM (e.g. header items
      // hidden for a role). Steps without `element` always survive.
      const availableSteps = STEPS.filter(
        (s) => typeof s.element !== "string" || !!document.querySelector(s.element)
      );
      if (availableSteps.length === 0) return;

      driverInstance = driver({
        popoverClass: "adpulse-tour",
        animate: true,
        overlayOpacity: 0.75,
        showProgress: true,
        progressText: "{{current}} из {{total}}",
        nextBtnText: "Далее →",
        prevBtnText: "← Назад",
        doneBtnText: "Готово",
        steps: availableSteps,
        onDestroyStarted: () => {
          localStorage.setItem(TOUR_KEY, "1");
          driverInstance?.destroy();
        },
      });

      // Small delay so the header renders its nav items before driver tries to find them
      setTimeout(() => {
        if (!cancelled) driverInstance?.drive();
      }, 600);
    });

    return () => {
      cancelled = true;
      driverInstance?.destroy();
    };
  }, [pathname]);

  return null;
}
