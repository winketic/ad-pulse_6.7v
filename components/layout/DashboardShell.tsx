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

const NAV_ITEMS = [
  { href: "/dashboard",              label: "Обзор",      Icon: LayoutDashboard },
  { href: "/dashboard/materials",    label: "Материалы",  Icon: Package         },
  { href: "/dashboard/transactions", label: "Движение",   Icon: ArrowLeftRight  },
  { href: "/dashboard/plans",        label: "Планы",      Icon: ClipboardList   },
  { href: "/dashboard/reports",      label: "Отчёты",     Icon: BarChart2       },
  { href: "/dashboard/whatsapp",     label: "WhatsApp",   Icon: MessageCircle   },
  { href: "/dashboard/settings",     label: "Настройки",  Icon: Settings        },
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
    <div className="flex h-screen bg-[#0a0a0a] overflow-hidden">

      {/* ── Desktop sidebar ───────────────────────────── */}
      <aside className="hidden lg:flex lg:flex-col w-[220px] shrink-0 bg-[#0a0a0a] border-r border-[#1f1f1f]">
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-[#1f1f1f]">
          <Logo size={32} />
          <div>
            <p className="text-[#ededed] font-semibold text-sm leading-tight">AD Pulse</p>
            <p className="text-[#888888] text-xs mt-0.5">Учёт материалов</p>
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
                className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-[#1f1f1f] text-[#ededed]"
                    : "text-[#888888] hover:bg-[#161616] hover:text-[#ededed]"
                }`}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-[#00f5c4] rounded-r" />
                )}
                <item.Icon
                  size={17}
                  strokeWidth={active ? 2 : 1.6}
                  className={active ? "text-[#00f5c4]" : ""}
                />
                <span className="flex-1">{item.label}</span>
                {badge > 0 && (
                  <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[#00f5c4] text-[#0a0a0a] text-[10px] font-bold">
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className="px-3 py-3 border-t border-[#1f1f1f] space-y-1">
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-[#00f5c4]/15 flex items-center justify-center shrink-0">
                <span className="text-[#00f5c4] text-xs font-bold uppercase">{userName.charAt(0)}</span>
              </div>
            )}
            <p className="text-[#ededed] text-sm font-medium truncate flex-1">{userName}</p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-[#888888] hover:bg-[#161616] hover:text-[#ededed] transition-colors"
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
          className="lg:hidden shrink-0 bg-[#0a0a0a] border-b border-[#1f1f1f] flex items-center px-4 gap-3"
          style={{ height: "calc(56px + env(safe-area-inset-top, 0px))", paddingTop: "env(safe-area-inset-top, 0px)" }}
        >
          <Logo size={28} />
          <span className="font-semibold text-[#ededed] text-sm">AD Pulse</span>
          <div className="flex-1" />
          <button
            onClick={handleLogout}
            className="p-2 rounded-lg text-[#888888] hover:text-[#ededed] hover:bg-[#161616] transition-colors"
          >
            <LogOut size={18} />
          </button>
        </header>

        {/* Desktop top bar */}
        <header className="hidden lg:flex h-12 shrink-0 bg-[#0a0a0a] border-b border-[#1f1f1f] items-center px-5 gap-3">
          <div className="flex-1" />
          <div className="flex items-center gap-2.5">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-[#00f5c4]/15 flex items-center justify-center">
                <span className="text-[#00f5c4] text-xs font-bold uppercase">{userName.charAt(0)}</span>
              </div>
            )}
            <span className="text-sm font-medium text-[#ededed]">{userName}</span>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-[#888888] hover:bg-[#161616] hover:text-[#ededed] transition-colors border border-[#1f1f1f]"
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

      {/* ── Mobile bottom navigation ──────────────────── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-[#0a0a0a] border-t border-[#1f1f1f]"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
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
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-[#00f5c4] rounded-b" />
                )}
                <span
                  className="transition-transform duration-100 active:scale-90"
                  style={{ color: active ? "#00f5c4" : "rgba(255,255,255,0.3)" }}
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
