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
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { Logo } from "@/components/Logo";

// ─── Nav items (mobile: 6, desktop: + WhatsApp via sidebar) ─

const NAV_ITEMS = [
  { href: "/dashboard",              label: "Главная",   Icon: LayoutDashboard },
  { href: "/dashboard/materials",    label: "Материалы", Icon: Package         },
  { href: "/dashboard/transactions", label: "Движение",  Icon: ArrowLeftRight  },
  { href: "/dashboard/plans",        label: "Планы",     Icon: ClipboardList   },
  { href: "/dashboard/reports",      label: "Отчёты",    Icon: BarChart2       },
  { href: "/dashboard/settings",     label: "Настройки", Icon: Settings        },
];

// WhatsApp only in desktop sidebar
const SIDEBAR_EXTRA = [
  {
    href: "/dashboard/whatsapp",
    label: "WhatsApp",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
  },
];

interface DashboardShellProps {
  children: React.ReactNode;
  userName: string;
  whatsappBadge?: number;
}

export default function DashboardShell({
  children,
  userName,
  whatsappBadge = 0,
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

  // ── Desktop sidebar ────────────────────────────────────
  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
        <Logo size={36} />
        <div>
          <p className="text-white font-bold text-base leading-tight">AD Pulse</p>
          <p className="text-white/50 text-xs">Учёт материалов</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {[...NAV_ITEMS, ...SIDEBAR_EXTRA].map((item) => {
          const active = isActive(item.href);
          const badge = item.href === "/dashboard/whatsapp" && whatsappBadge > 0 ? whatsappBadge : 0;
          const icon = "Icon" in item
            ? <item.Icon size={20} />
            : item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={true}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active ? "bg-white/15 text-white" : "text-white/65 hover:bg-white/8 hover:text-white"
              }`}
            >
              <span className={active ? "text-[#00f5c4]" : "text-white/65"}>{icon}</span>
              <span className="flex-1">{item.label}</span>
              {badge > 0 && (
                <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-yellow-400 text-[#05050a] text-xs font-bold">
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-white/10 space-y-1">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
            <span className="text-white text-xs font-semibold uppercase">{userName.charAt(0)}</span>
          </div>
          <p className="text-white text-sm font-medium truncate flex-1">{userName}</p>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-white/65 hover:bg-white/8 hover:text-white transition-colors"
        >
          <LogOut size={16} />
          Выйти
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* ── Desktop sidebar ───────────────────────────── */}
      <aside className="hidden lg:flex lg:flex-col w-60 shrink-0 bg-[#05050a]">
        <SidebarContent />
      </aside>

      {/* ── Main area ─────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* ── Mobile top bar ────────────────────────── */}
        <header
          className="lg:hidden shrink-0 bg-[#05050a] flex items-center px-4 gap-3"
          style={{
            height: "calc(56px + env(safe-area-inset-top, 0px))",
            paddingTop: "env(safe-area-inset-top, 0px)",
          }}
        >
          <Logo size={32} />
          <span className="font-semibold text-white text-sm">AD Pulse</span>
          <div className="flex-1" />
          <button
            onClick={handleLogout}
            className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Выйти"
          >
            <LogOut size={20} />
          </button>
        </header>

        {/* ── Desktop top bar ───────────────────────── */}
        <header className="hidden lg:flex h-14 shrink-0 bg-white border-b border-gray-200 items-center px-4 gap-3">
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-[#05050a]/10 flex items-center justify-center">
              <span className="text-[#05050a] text-xs font-bold uppercase">{userName.charAt(0)}</span>
            </div>
            <span className="text-sm font-medium text-gray-700">{userName}</span>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors border border-gray-200"
          >
            <LogOut size={16} />
            <span>Выйти</span>
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

      {/* ── Mobile bottom navigation ──────────────────── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-[#05050a]"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="flex items-stretch h-[68px]">
          {NAV_ITEMS.map(({ href, Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                prefetch={true}
                className="flex-1 flex flex-col items-center justify-center relative group"
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                {/* Active dot */}
                {active && (
                  <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#00f5c4]" />
                )}
                <span
                  className="transition-transform duration-100 active:scale-90"
                  style={{ color: active ? "#00f5c4" : "rgba(255,255,255,0.4)" }}
                >
                  <Icon size={26} strokeWidth={active ? 2 : 1.8} />
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
