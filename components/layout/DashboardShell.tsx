"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Package,
  ArrowLeftRight,
  ClipboardList,
  BarChart2,
  Settings,
  LogOut,
  MessageCircle,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { Logo } from "@/components/Logo";
import OnboardingTour from "@/components/OnboardingTour";

const NAV_ITEMS = [
  { href: "/dashboard",              label: "Обзор",      Icon: LayoutDashboard, tourId: "tour-nav-overview"      },
  { href: "/dashboard/materials",    label: "Материалы",  Icon: Package,         tourId: "tour-nav-materials"     },
  { href: "/dashboard/transactions", label: "Движение",   Icon: ArrowLeftRight,  tourId: "tour-nav-transactions"  },
  { href: "/dashboard/plans",        label: "Планы",      Icon: ClipboardList,   tourId: undefined                },
  { href: "/dashboard/reports",      label: "Отчёты",     Icon: BarChart2,       tourId: undefined                },
  { href: "/dashboard/whatsapp",     label: "WhatsApp",   Icon: MessageCircle,   tourId: "tour-nav-whatsapp"      },
  { href: "/dashboard/settings",     label: "Настройки",  Icon: Settings,        tourId: "tour-nav-settings"      },
];

const MOBILE_NAV = NAV_ITEMS.filter((i) => i.href !== "/dashboard/whatsapp");

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
  const router = useRouter();
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === href : pathname.startsWith(href);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg)" }}>

      {/* ── Desktop sidebar ───────────────────────────── */}
      <aside
        className="hidden lg:flex lg:flex-col w-[220px] shrink-0"
        style={{ background: "var(--bg)", borderRight: "1px solid var(--border)" }}
      >
        {/* Logo */}
        <div
          className="flex items-center gap-3 px-5 py-5"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <Logo size={32} />
          <div>
            <p className="font-semibold text-sm leading-tight" style={{ color: "var(--text)" }}>AD Pulse</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>Учёт материалов</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            const badge = item.href === "/dashboard/whatsapp" && whatsappBadge > 0 ? whatsappBadge : 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch
                id={item.tourId}
                className="relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
                style={{
                  background: active ? "var(--bg3)" : "transparent",
                  color: active ? "var(--text)" : "var(--muted)",
                }}
                onMouseEnter={(e) => {
                  if (!active) {
                    (e.currentTarget as HTMLElement).style.background = "var(--bg2)";
                    (e.currentTarget as HTMLElement).style.color = "var(--text)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                    (e.currentTarget as HTMLElement).style.color = "var(--muted)";
                  }
                }}
              >
                {active && (
                  <span
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r"
                    style={{ background: "var(--accent)" }}
                  />
                )}
                <item.Icon
                  size={17}
                  strokeWidth={active ? 2 : 1.6}
                  style={{ color: active ? "var(--accent)" : undefined }}
                />
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
        </nav>

        {/* User */}
        <div
          className="px-3 py-3 space-y-1"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
            ) : (
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                style={{ background: "var(--accent-15)" }}
              >
                <span className="text-xs font-bold uppercase" style={{ color: "var(--accent)" }}>
                  {userName.charAt(0)}
                </span>
              </div>
            )}
            <p className="text-sm font-medium truncate flex-1" style={{ color: "var(--text)" }}>{userName}</p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors"
            style={{ color: "var(--muted)" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "var(--bg2)";
              (e.currentTarget as HTMLElement).style.color = "var(--text)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
              (e.currentTarget as HTMLElement).style.color = "var(--muted)";
            }}
          >
            <LogOut size={15} />
            Выйти
          </button>
        </div>
      </aside>

      {/* ── Main area ─────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0">

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
            onClick={handleLogout}
            className="p-2 rounded-lg transition-colors"
            style={{ color: "var(--muted)" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "var(--bg2)";
              (e.currentTarget as HTMLElement).style.color = "var(--text)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
              (e.currentTarget as HTMLElement).style.color = "var(--muted)";
            }}
          >
            <LogOut size={18} />
          </button>
        </header>

        {/* Desktop top bar */}
        <header
          className="hidden lg:flex h-12 shrink-0 items-center px-5 gap-3"
          style={{ background: "var(--bg)", borderBottom: "1px solid var(--border)" }}
        >
          <div className="flex-1" />
          <div className="flex items-center gap-2.5">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
            ) : (
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: "var(--accent-15)" }}
              >
                <span className="text-xs font-bold uppercase" style={{ color: "var(--accent)" }}>
                  {userName.charAt(0)}
                </span>
              </div>
            )}
            <span className="text-sm font-medium" style={{ color: "var(--text)" }}>{userName}</span>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors"
            style={{ color: "var(--muted)", border: "1px solid var(--border)" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "var(--bg2)";
              (e.currentTarget as HTMLElement).style.color = "var(--text)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
              (e.currentTarget as HTMLElement).style.color = "var(--muted)";
            }}
          >
            <LogOut size={14} />
            Выйти
          </button>
        </header>

        {/* Page content */}
        <main
          className="flex-1 overflow-auto overflow-x-hidden lg:pb-0"
          style={{ paddingBottom: "calc(68px + env(safe-area-inset-bottom, 0px))" }}
        >
          {children}
        </main>
      </div>

      <OnboardingTour />

      {/* ── Mobile bottom navigation ──────────────────── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 lg:hidden"
        style={{
          background: "var(--bg)",
          borderTop: "1px solid var(--border)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <div className="flex items-stretch h-[68px]">
          {MOBILE_NAV.map(({ href, Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                prefetch
                className="flex-1 flex flex-col items-center justify-center relative group"
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                {active && (
                  <span
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-b"
                    style={{ background: "var(--accent)" }}
                  />
                )}
                <span
                  className="transition-transform duration-100 active:scale-90"
                  style={{ color: active ? "var(--accent)" : "var(--muted)" }}
                >
                  <Icon size={24} strokeWidth={active ? 2 : 1.6} />
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
