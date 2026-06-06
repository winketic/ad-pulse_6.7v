import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import WazzupCard from "@/components/settings/WazzupCard";
import CompanySettings from "@/components/settings/CompanySettings";
import UserManagement from "@/components/settings/UserManagement";
import TelegramCard from "@/components/settings/TelegramCard";

export const dynamic = "force-dynamic";
export const revalidate = 0;
import { listCompanyUsers } from "./actions";

const ROLE_LABELS: Record<string, string> = {
  admin: "Администратор",
  manager: "Менеджер",
  warehouse: "Склад",
  workshop: "Цех",
};

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  admin: { bg: "bg-purple-100", text: "text-purple-700" },
  manager: { bg: "bg-blue-100", text: "text-blue-700" },
  warehouse: { bg: "bg-amber-100", text: "text-amber-700" },
  workshop: { bg: "bg-green-100", text: "text-green-700" },
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { wazzup?: string; reason?: string };
}) {
  console.log("[settings] page rendering...");
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  console.log("[settings] auth.getUser done:", user?.id ?? "no user", authError?.message ?? "ok");
  if (!user) return null;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("full_name, role, company_id")
    .eq("id", user.id)
    .single();
  console.log("[settings] profile query done:", profile?.role, profileError?.message ?? "ok");

  const company_id = profile?.company_id as string | undefined;
  const role = profile?.role ?? "warehouse";
  const isAdmin = role === "admin";
  const canEditCompany = role === "admin" || role === "manager";

  let companyName = "—";
  let isConnected = false;
  let tokenExpiresAt: string | null = null;
  let hasConfig = false;
  let configEmail: string | null = null;
  let configClientId: string | null = null;
  let telegramConnected = false;

  if (company_id) {
    try {
      const { data } = await supabase
        .from("companies")
        .select("name, telegram_connected")
        .eq("id", company_id)
        .single();
      companyName = data?.name ?? "—";
      telegramConnected = data?.telegram_connected ?? false;
      console.log("[settings] companies query done:", companyName);
    } catch (e) { console.error("[settings] companies query failed:", e); }

    try {
      const { data } = await supabase
        .from("wazzup_tokens")
        .select("id, expires_at")
        .eq("company_id", company_id)
        .single();
      isConnected = !!data;
      tokenExpiresAt = data?.expires_at ?? null;
      console.log("[settings] wazzup_tokens query done: isConnected=", isConnected);
    } catch (e) { console.error("[settings] wazzup_tokens query failed:", e); }

    try {
      const service = createServiceClient();
      const { data: cfg } = await service
        .from("wazzup_config")
        .select("partner_email, client_id")
        .eq("company_id", company_id)
        .maybeSingle();
      const cleanStr = (s: string | null) => s?.replace(/\uFEFF/g, "").trim() ?? null;
      const cleanEmail = cleanStr(cfg?.partner_email ?? null);
      const cleanClientId = cleanStr(cfg?.client_id ?? null);
      hasConfig = !!(cleanEmail && cleanClientId);
      configEmail = cleanEmail;
      configClientId = cleanClientId;
      console.log("[settings] wazzup_config query done: hasConfig=", hasConfig);
    } catch (e) { console.error("[settings] wazzup_config query failed:", e); }
  }

  console.log("[settings] listCompanyUsers starting...");
  let users: Awaited<ReturnType<typeof listCompanyUsers>> = [];
  if (company_id) {
    try {
      const result = await listCompanyUsers();
      users = result ?? [];
    } catch (e) {
      console.error("[settings] listCompanyUsers error:", e);
      users = [];
    }
  }
  console.log("[settings] listCompanyUsers done:", users.length, "users");

  const roleStyle = ROLE_COLORS[role] ?? ROLE_COLORS.warehouse;
  const initials = (profile?.full_name ?? user.email ?? "U")
    .split(" ")
    .map((w: string) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Настройки</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Управление профилем и интеграциями
        </p>
      </div>

      <div className="space-y-4">
        {/* ── Profile ──────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Профиль</h2>
          </div>
          <div className="px-5 py-5 flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#1a472a] flex items-center justify-center shrink-0">
              <span className="text-white text-base font-bold">{initials}</span>
            </div>
            <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-medium text-gray-400 mb-0.5">Полное имя</p>
                <p className="text-sm font-medium text-gray-900">
                  {profile?.full_name ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400 mb-0.5">Email</p>
                <p className="text-sm text-gray-700 truncate">{user.email ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400 mb-0.5">Роль</p>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${roleStyle.bg} ${roleStyle.text}`}
                >
                  {ROLE_LABELS[role] ?? role}
                </span>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400 mb-0.5">ID пользователя</p>
                <p className="text-xs text-gray-400 font-mono truncate">{user.id}</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Company ───────────────────────────────────── */}
        <CompanySettings
          companyId={company_id ?? null}
          companyName={companyName}
          canEdit={canEditCompany}
        />

        {/* ── Users (admin only) ─────────────────────── */}
        {company_id && (
          <UserManagement
            users={users}
            currentUserId={user.id}
            isAdmin={isAdmin}
          />
        )}

        {/* ── WhatsApp / Wazzup ─────────────────────── */}
        <WazzupCard
          isConnected={isConnected}
          expiresAt={tokenExpiresAt}
          flash={searchParams.wazzup ?? null}
          hasConfig={hasConfig}
          configEmail={configEmail}
          configClientId={configClientId}
          isAdmin={isAdmin}
        />

        {/* ── Telegram ─────────────────────────────── */}
        {company_id && (
          <TelegramCard
            companyId={company_id}
            telegramConnected={telegramConnected}
            isAdmin={isAdmin}
          />
        )}
      </div>
    </div>
  );
}
