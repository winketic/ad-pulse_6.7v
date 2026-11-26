import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/middleware";
import { isPlatformOwnerEmail } from "@/lib/auth/platform-owner";
import { canAccessCompanyPage, defaultDashboardPath } from "@/lib/auth/role-permissions";

const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/auth/confirm",
  "/invite",
  "/support",
  // Колбэк эквайринга приходит от Freedom Pay без cookie и сессии.
  "/api/billing/fp-result",
  // Форма поддержки с лендинга: запрос без cookie, защита — CORS и honeypot.
  "/api/support/public",
  // Без сессии маршрут отвечает 401 JSON, а не редиректом на /login:
  // его вызывает фоновая проверка с любой страницы кабинета.
  "/api/auth/session",
  "/api/telegram/webhook",
  "/api/telegram/setup",
  // Собственный шлюз WhatsApp: сюда шлюз шлёт входящие сообщения без сессии.
  // Защита — секрет в URL (/api/whatsapp/webhook/<token>) + заголовок X-Gateway-Token.
  "/api/whatsapp/webhook",
  // Vercel Cron приходит без пользовательской сессии: без этого middleware
  // редиректил его на /login, и cron-маршруты ни разу не выполнялись.
  // Сами маршруты проверяют CRON_SECRET.
  "/api/cron/",
];

export async function middleware(request: NextRequest) {
  const { supabase, supabaseResponse } = createClient(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: { session } } = await supabase.auth.getSession();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  // Unauthenticated — redirect to login, preserve destination
  if (!user && !session && !isPublic) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  if (user) {
    // Admin-only routes
    if (pathname.startsWith("/admin")) {
      if (!isPlatformOwnerEmail(user.email)) {
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
    }

    // Swagger docs — only the platform owner
    if (pathname.startsWith("/docs") || pathname.startsWith("/api-docs/")) {
      if (!isPlatformOwnerEmail(user.email)) {
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
    }

    if (pathname.startsWith("/dashboard/") && !pathname.startsWith("/dashboard/settings")) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      if (profile?.role && !canAccessCompanyPage(profile.role, pathname)) {
        return NextResponse.redirect(new URL(defaultDashboardPath(profile.role), request.url));
      }
    }

    // Подтверждение почты больше не блокирует вход: пользователь попадает
    // в кабинет сразу, а входы с новых IP/устройств фиксируются в user_devices
    // и сопровождаются письмом. Так решил владелец продукта: письма Supabase
    // на free tier теряются, и регистрация вставала без человека.

    if (pathname === "/login" || pathname === "/") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
