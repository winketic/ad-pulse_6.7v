"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import {
  LayoutDashboard,
  Package,
  Warehouse,
  ArrowLeftRight,
  ClipboardList,
  BarChart2,
  Settings,
  LogOut,
  MessageCircle,
  MoreVertical,
  Factory,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { Logo } from "@/components/Logo";
import OnboardingTour from "@/components/OnboardingTour";

const NAV_ITEMS = [
  { href: "/dashboard",              label: "Обзор",      Icon: LayoutDashboard, tourId: "tour-nav-overview"     },
  { href: "/dashboard/materials",    label: "Материалы",  Icon: Package,         tourId: "tour-nav-materials"    },
  { href: "/dashboard/warehouse",   label: "Склад",      Icon: Warehouse,       tourId: undefined               },
  { href: "/dashboard/transactions", label: "Движение",   Icon: ArrowLeftRight,  tourId: "tour-nav-transactions" },
  { href: "/dashboard/plans",        label: "Планы",      Icon: ClipboardList,   tourId: undefined               },
  { href: "/dashboard/reports",      label: "Отчёты",     Icon: BarChart2,       tourId: undefined               },
  { href: "/dashboard/whatsapp",     label: "WhatsApp",   Icon: MessageCircle,   tourId: "tour-nav-whatsapp"     },
  { href: "/dashboard/settings",     label: "Настройки",  Icon: Settings,        tourId: "tour-nav-settings"     },
  { href: "/dashboard/produce",      label: "Выпуск",     Icon: Factory,         tourId: undefined               },
];

// Mobile bottom nav — 2 + FAB + 2. The center FAB is the primary
// action (production entry), everything else is navigation.
const MOBILE_NAV_LEFT = [
  NAV_ITEMS[0], // Обзор
  NAV_ITEMS[2], // Склад
];
const MOBILE_NAV_RIGHT = [
  NAV_ITEMS[3], // Движение
  NAV_ITEMS[4], // Планы
];
const FAB_HREF = "/dashboard/produce";

// Items surfaced in the "More" bottom sheet on mobile
const MORE_ITEMS = [
  NAV_ITEMS[1], // Материалы
  NAV_ITEMS[5], // Отчёты
  NAV_ITEMS[7], // Настройки
];

// Desktop top-nav tabs (GitHub/Vercel style). Secondary destinations
// live in the user dropdown.
const DESKTOP_TABS = [
  NAV_ITEMS[0], // Обзор
  NAV_ITEMS[2], // Склад
  NAV_ITEMS[3], // Движение
  NAV_ITEMS[4], // Планы
  NAV_ITEMS[5], // Отчёты
];
const USER_MENU_ITEMS = [
  NAV_ITEMS[1], // Материалы
  NAV_ITEMS[6], // WhatsApp
  NAV_ITEMS[7], // Настройки
];

// Bottom-bar tab with active pill
function NavTab({
  item,
  active,
}: {
  item: { href: string; label: string; Icon: React.ElementType };
  active: boolean;
}) {
  const { href, label, Icon } = item;
  return (
    <Link
      href={href}
      prefetch
      className="flex-1 min-h-[64px] flex flex-col items-center justify-center gap-1 relative py-1.5 tap-scale"
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      {/* No pill — the icon and label themselves light up */}
      <span
        className="flex items-center justify-center h-8 transition-colors duration-200"
        style={{ color: active ? "var(--accent)" : "var(--muted)" }}
      >
        <Icon className="w-6 h-6" strokeWidth={active ? 2.2 : 1.6} />
      </span>
      <span
        className="text-[11px] leading-none transition-colors duration-200"
        style={{
          color: active ? "var(--accent)" : "var(--muted)",
          fontWeight: active ? 700 : 500,
        }}
      >
        {label}
      </span>
    </Link>
  );
}

interface DashboardShellProps {
  children: React.ReactNode;
  userName: string;
  whatsappBadge?: number;
  avatarUrl?: string | null;
}

export default function DashboardShell({
  children,
  userName,
  whatsappBadge = 0,
  avatarUrl,
}: DashboardShellProps) {
  const pathname = usePathname();
  const router   = useRouter();
  const supabase = createClient();
  const [moreOpen, setMoreOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close "more" sheet on navigation
  useEffect(() => { setMoreOpen(false); setMenuOpen(false); }, [pathname]);

  // Close on Escape
  useEffect(() => {
    if (!moreOpen && !menuOpen) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setMoreOpen(false); setMenuOpen(false); }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [moreOpen, menuOpen]);

  // Close user dropdown on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [menuOpen]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === href : pathname.startsWith(href);

  const initials = userName.charAt(0).toUpperCase();

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: "var(--bg)" }}>

      {/* ── Desktop top nav (GitHub/Vercel style) ───────────── */}
      <header
        className="hidden lg:flex items-center px-6 shrink-0 h-14"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--bg)" }}
      >
        <Link href="/dashboard" className="flex items-center gap-2.5 shrink-0 mr-6">
          <Logo size={26} />
          <span className="font-semibold text-sm" style={{ color: "var(--text)" }}>AD Pulse</span>
        </Link>

        {/* Tabs — full-height with bottom indicator */}
        <nav className="flex items-stretch h-full">
          {DESKTOP_TABS.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch
                id={item.tourId}
                className="relative flex items-center px-3.5 text-sm transition-colors duration-150"
                style={{
                  color: active ? "var(--text)" : "var(--muted)",
                  fontWeight: active ? 600 : 400,
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text)"; }}
                onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.color = "var(--muted)"; }}
              >
                {item.label}
                {active && (
                  <span
                    className="absolute bottom-0 left-2 right-2 h-0.5 rounded-t"
                    style={{ background: "var(--accent)" }}
                  />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="flex-1" />

        {/* Primary action */}
        <Link
          href="/dashboard/produce"
          prefetch
          className="flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-sm font-semibold transition-colors duration-150 mr-3"
          style={{ background: "var(--accent)", color: "var(--accent-text)" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--accent-hover)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--accent)"; }}
        >
          <Factory size={15} strokeWidth={2.2} />
          Выпуск
        </Link>

        {/* User menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 h-9 pl-1.5 pr-2.5 rounded-lg transition-colors duration-150 hover:bg-[var(--surface-2)]"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover" />
            ) : (
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold"
                style={{ background: "var(--accent-15)", color: "var(--accent)" }}
              >
                {initials}
              </span>
            )}
            <span className="text-sm max-w-[140px] truncate" style={{ color: "var(--text)" }}>
              {userName}
            </span>
            <svg className="w-3.5 h-3.5" style={{ color: "var(--muted)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {menuOpen && (
            <div
              className="absolute right-0 top-11 w-56 rounded-xl py-1.5 z-[60]"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border-strong)",
                boxShadow: "var(--shadow-raised)",
                animation: "fadeIn 120ms var(--ease)",
              }}
              role="menu"
            >
              {USER_MENU_ITEMS.map((item) => {
                const badge = item.href === "/dashboard/whatsapp" && whatsappBadge > 0 ? whatsappBadge : 0;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-2.5 px-3.5 py-2 text-sm transition-colors duration-150 hover:bg-[var(--surface-3)]"
                    style={{ color: "var(--text)" }}
                    role="menuitem"
                  >
                    <item.Icon size={15} strokeWidth={1.8} style={{ color: "var(--muted)" }} />
                    <span className="flex-1">{item.label}</span>
                    {badge > 0 && (
                      <span
                        className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold"
                        style={{ background: "var(--accent)", color: "var(--accent-text)" }}
                      >
                        {badge > 99 ? "99+" : badge}
                      </span>
                    )}
                  </Link>
                );
              })}
              <div className="my-1.5" style={{ borderTop: "1px solid var(--border)" }} />
              <button
                onClick={handleLogout}
                className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm transition-colors duration-150 hover:bg-[var(--surface-3)]"
                style={{ color: "var(--muted)" }}
                role="menuitem"
              >
                <LogOut size={15} strokeWidth={1.8} />
                Выйти
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ── Main area ───────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0">

        {/* Mobile top bar */}
        <header
          className="lg:hidden shrink-0 flex items-center px-4 gap-3"
          style={{
            background: "var(--bg)",
            borderBottom: "1px solid var(--border)",
            height: "calc(56px + env(safe-area-inset-top, 0px))",
            paddingTop: "env(safe-area-inset-top, 0px)",
          }}
        >
          <Logo size={28} />
          <span className="font-semibold text-sm" style={{ color: "var(--text)" }}>AD Pulse</span>
          <div className="flex-1" />
          <button
            onClick={() => setMoreOpen(true)}
            className="p-2 rounded-lg transition-colors"
            style={{ color: "var(--muted)" }}
            title="Ещё"
          >
            <MoreVertical size={20} />
          </button>
          <button
            onClick={handleLogout}
            className="p-2 rounded-lg transition-colors"
            style={{ color: "var(--muted)" }}
            title="Выйти"
          >
            <LogOut size={18} />
          </button>
        </header>

        {/* ── "More" bottom sheet ─────────────────────────────── */}
        {moreOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm lg:hidden"
              onClick={() => setMoreOpen(false)}
            />
            {/* Sheet */}
            <div
              className="fixed bottom-0 left-0 right-0 z-[71] lg:hidden rounded-t-2xl overflow-hidden"
              style={{
                background: "var(--surface-2)",
                borderTop: "1px solid var(--border-strong)",
                paddingBottom: "env(safe-area-inset-bottom, 0px)",
                animation: "slideUpSheet 240ms var(--ease-out) both",
              }}
            >
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-9 h-1 rounded-full" style={{ background: "var(--border)" }} />
              </div>

              {/* Links */}
              <nav className="px-4 pb-5 pt-2 space-y-1">
                {MORE_ITEMS.map(({ href, label, Icon }) => {
                  const active = isActive(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      className="flex items-center gap-3.5 px-3 py-3 rounded-xl text-sm font-medium transition-colors"
                      style={{
                        background: active ? "var(--bg3)" : "transparent",
                        color: active ? "var(--accent)" : "var(--text)",
                      }}
                    >
                      <Icon
                        size={20}
                        strokeWidth={active ? 2 : 1.6}
                        style={{ color: active ? "var(--accent)" : "var(--muted)" }}
                      />
                      {label}
                    </Link>
                  );
                })}
              </nav>
            </div>
          </>
        )}

        {/* Page content — keyed by pathname so route changes remount with a
            fade-in (View Transitions API isn't available in Next 14 App
            Router; opacity-only animation keeps this at 60fps). */}
        <main
          className="flex-1 overflow-auto overflow-x-hidden lg:pb-0"
          style={{ paddingBottom: "calc(72px + env(safe-area-inset-bottom, 0px))" }}
        >
          {/* No fill-mode: a completed opacity animation with fill "both"
              keeps a stacking context alive, trapping every z-indexed
              overlay inside — bottom sheets would render UNDER the nav bar */}
          <div key={pathname} style={{ animation: "fadeIn 160ms var(--ease)" }}>
            {children}
          </div>
        </main>
      </div>

      <OnboardingTour />

      {/* ── Mobile bottom nav (icons only) ──────────────────── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 lg:hidden"
        style={{
          background: "var(--bg)",
          borderTop: "1px solid var(--border)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <div className="flex items-stretch min-h-[72px] px-1">
          {MOBILE_NAV_LEFT.map((item) => (
            <NavTab key={item.href} item={item} active={isActive(item.href)} />
          ))}

          {/* Center FAB — primary action: production entry */}
          <div className="flex-1 relative flex justify-center">
            <Link
              href={FAB_HREF}
              prefetch
              aria-label="Записать выпуск"
              className="absolute -top-5 w-16 h-16 rounded-full flex items-center justify-center tap-scale"
              style={{
                background: "var(--accent)",
                color: "var(--accent-text)",
                boxShadow: isActive(FAB_HREF)
                  ? "0 0 0 3px var(--bg), 0 0 0 5px var(--accent), 0 8px 24px color-mix(in srgb, var(--accent) 35%, transparent)"
                  : "0 0 0 4px var(--bg), 0 8px 24px color-mix(in srgb, var(--accent) 35%, transparent)",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              <Factory className="w-7 h-7" strokeWidth={2.2} />
            </Link>
            <span
              className="self-end pb-2 text-[11px] leading-none"
              style={{
                color: isActive(FAB_HREF) ? "var(--accent)" : "var(--muted)",
                fontWeight: isActive(FAB_HREF) ? 700 : 500,
              }}
            >
              Выпуск
            </span>
          </div>

          {MOBILE_NAV_RIGHT.map((item) => (
            <NavTab key={item.href} item={item} active={isActive(item.href)} />
          ))}
        </div>
      </nav>
    </div>
  );
}
