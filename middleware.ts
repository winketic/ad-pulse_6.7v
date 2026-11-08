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
  "/api/telegram/webhook",
  "/api/telegram/setup",
  "/api/wazzup/webhook",
  "/api/wazzup/callback",
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

    // Unverified email
    if (
      !user.email_confirmed_at &&
      !pathname.startsWith("/verify-email") &&
      !pathname.startsWith("/reset-password") &&
      !pathname.startsWith("/invite") &&
      !pathname.startsWith("/onboarding")
    ) {
      return NextResponse.redirect(new URL("/verify-email", request.url));
    }

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
