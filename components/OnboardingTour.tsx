"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import "driver.js/dist/driver.css";

const TOUR_KEY = "ad_pulse_tour_done";

const STEPS = [
  {
    element: "#tour-nav-overview",
    popover: {
      title: "Обзор",
      description: "Главная страница: остатки, движение за день, быстрые показатели по вашему складу.",
      side: "right" as const,
      align: "start" as const,
    },
  },
  {
    element: "#tour-nav-materials",
    popover: {
      title: "Материалы",
      description: "Справочник материалов: добавляйте позиции, задавайте единицы измерения и нормы ГОСТ.",
      side: "right" as const,
      align: "start" as const,
    },
  },
  {
    element: "#tour-nav-transactions",
    popover: {
      title: "Движение",
      description: "Все операции: приход, расход, брак, возврат. Можно фильтровать и экспортировать в Excel.",
      side: "right" as const,
      align: "start" as const,
    },
  },
  {
    element: "#tour-nav-whatsapp",
    popover: {
      title: "WhatsApp",
      description: "Сообщения из WhatsApp автоматически распознаются и превращаются в транзакции. Здесь — очередь на проверку.",
      side: "right" as const,
      align: "start" as const,
    },
  },
  {
    element: "#tour-nav-settings",
    popover: {
      title: "Настройки",
      description: "Пригласите коллег, подключите Telegram-уведомления и настройте пороги остатков.",
      side: "right" as const,
      align: "start" as const,
    },
  },
];

export default function OnboardingTour() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/dashboard") return;
    if (typeof window === "undefined") return;
    if (localStorage.getItem(TOUR_KEY)) return;
    if (window.innerWidth < 1024) return;

    let driverInstance: { drive: () => void; destroy: () => void } | null = null;

    import("driver.js").then(({ driver }) => {
      driverInstance = driver({
        popoverClass: "adpulse-tour",
        animate: true,
        overlayOpacity: 0.75,
        showProgress: true,
        nextBtnText: "Далее →",
        prevBtnText: "← Назад",
        doneBtnText: "Готово",
        steps: STEPS,
        onDestroyStarted: () => {
          localStorage.setItem(TOUR_KEY, "1");
          driverInstance?.destroy();
        },
      });

      // Small delay so the sidebar renders its nav items before driver tries to find them
      const t = setTimeout(() => driverInstance?.drive(), 600);
      return () => clearTimeout(t);
    });

    return () => {
      driverInstance?.destroy();
    };
  }, [pathname]);

  return null;
}
