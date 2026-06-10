import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import SettingsClient from "@/components/settings/SettingsClient";
import type { TabId } from "@/components/settings/SettingsTabs";
import { listCompanyUsers } from "./actions";
import { MaterialThresholds } from "@/components/settings/MaterialThresholds";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ROLE_LABELS: Record<string, string> = {
  admin: "Администратор",
  manager: "Менеджер",
  warehouse: "Склад",
  workshop: "Цех",
};

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  admin:     { bg: "bg-purple-500/15 border border-purple-500/20",  text: "text-purple-300"  },
  manager:   { bg: "bg-blue-500/15 border border-blue-500/20",      text: "text-blue-300"    },
  warehouse: { bg: "bg-amber-500/15 border border-amber-500/20",    text: "text-amber-300"   },
  workshop:  { bg: "bg-emerald-500/15 border border-emerald-500/20",text: "text-emerald-300" },
};

const VALID_TABS: TabId[] = ["profile", "company", "team"];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { tab?: string; wazzup?: string };
}) {
  const rawTab = searchParams.tab ?? "profile";
  const initialTab: TabId = VALID_TABS.includes(rawTab as TabId)
    ? (rawTab as TabId)
    : "profile";

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, company_id, position, avatar_url, banner_color")
    .eq("id", user.id)
    .single();

  const company_id = profile?.company_id as string | undefined;
  const role = profile?.role ?? "warehouse";
  const isAdmin = role === "admin";
  const canEditCompany = role === "admin" || role === "manager";
  const roleStyle = ROLE_COLORS[role] ?? ROLE_COLORS.warehouse;

  // ── Load all data in parallel ───────────────────────────
  const [companyResult, wazzupTokenResult, wazzupConfigResult, usersResult, materialsResult, thresholdsResult] = await Promise.all([
    // Company info
    company_id
      ? supabase.from("companies").select("name, telegram_connected").eq("id", company_id).single()
      : Promise.resolve({ data: null }),

    // Wazzup token
    company_id
      ? supabase.from("wazzup_tokens").select("id, expires_at").eq("company_id", company_id).single()
      : Promise.resolve({ data: null }),

    // Wazzup config (service client)
    company_id
      ? (async () => {
          try {
            const svc = createServiceClient();
            return svc.from("wazzup_config").select("partner_email, client_id").eq("company_id", company_id).maybeSingle();
          } catch {
            return { data: null };
          }
        })()
      : Promise.resolve({ data: null }),

    // Users list
    company_id && isAdmin
      ? listCompanyUsers().catch(() => [])
      : Promise.resolve([]),

    // Materials (for threshold settings)
    company_id && (isAdmin || canEditCompany)
      ? supabase.from("materials").select("id, name, unit").eq("company_id", company_id).order("name")
      : Promise.resolve({ data: [] }),

    // Existing thresholds
    company_id && (isAdmin || canEditCompany)
      ? supabase.from("material_thresholds").select("material_id, min_quantity").eq("company_id", company_id)
      : Promise.resolve({ data: [] }),
  ]);

  // ── Derived values ──────────────────────────────────────
  const companyName = companyResult.data?.name ?? "—";
  const telegramConnected = companyResult.data?.telegram_connected ?? false;

  const isConnected = !!wazzupTokenResult.data;
  const tokenExpiresAt = wazzupTokenResult.data?.expires_at ?? null;

  const clean = (s: string | null | undefined) => s?.replace(/﻿/g, "").trim() ?? null;
  const configEmail = clean(wazzupConfigResult.data?.partner_email);
  const configClientId = clean(wazzupConfigResult.data?.client_id);
  const hasConfig = !!(configEmail && configClientId);

  const users = Array.isArray(usersResult) ? usersResult : [];
  const materials = (materialsResult as { data: { id: string; name: string; unit: string }[] | null }).data ?? [];
  const thresholds = (thresholdsResult as { data: { material_id: string; min_quantity: number }[] | null }).data ?? [];

  const thresholdSection = canEditCompany ? (
    <div className="mt-6">
      <h3 className="text-sm font-semibold text-[#ededed] mb-3">Пороги остатков (Telegram-алерты)</h3>
      <p className="text-xs text-[#888888] mb-4">
        Укажите минимальный остаток для каждого материала. При достижении порога придёт Telegram-уведомление.
      </p>
      <MaterialThresholds materials={materials} initialThresholds={thresholds} />
    </div>
  ) : null;

  return (
    <SettingsClient
      // Profile
      fullName={profile?.full_name ?? null}
      email={user.email ?? "—"}
      roleLabel={ROLE_LABELS[role] ?? role}
      roleBg={roleStyle.bg}
      roleText={roleStyle.text}
      position={profile?.position ?? null}
      userId={user.id}
      companyId={company_id ?? null}
      avatarUrl={profile?.avatar_url ?? null}
      bannerColor={profile?.banner_color ?? null}
      // Company
      companyName={companyName}
      telegramConnected={telegramConnected}
      // Wazzup
      isConnected={isConnected}
      tokenExpiresAt={tokenExpiresAt}
      hasConfig={hasConfig}
      configEmail={configEmail}
      configClientId={configClientId}
      // Users
      users={users}
      // Meta
      isAdmin={isAdmin}
      canEditCompany={canEditCompany}
      initialTab={initialTab}
      wazzupFlash={searchParams.wazzup ?? null}
      thresholdSection={thresholdSection}
    />
  );
}
