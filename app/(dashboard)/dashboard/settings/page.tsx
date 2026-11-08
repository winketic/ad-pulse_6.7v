import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import SettingsClient from "@/components/settings/SettingsClient";
import type { TabId } from "@/components/settings/SettingsTabs";
import { listCompanyUsers } from "./actions";
import { MaterialThresholds } from "@/components/settings/MaterialThresholds";
import RefreshButton from "@/components/ui/RefreshButton";

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

type UserRows = Awaited<ReturnType<typeof listCompanyUsers>>;

// Человекочитаемые названия блоков для состояния ошибки (без error.message).
const READ_ERROR_LABELS = {
  profile: "профиль",
  company: "компания",
  whatsapp: "подключение WhatsApp",
  users: "команда",
  materials: "материалы",
  thresholds: "пороги остатков",
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const rawTab = sp.tab ?? "profile";
  const initialTab: TabId = VALID_TABS.includes(rawTab as TabId)
    ? (rawTab as TabId)
    : "profile";

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile, error: profileError } = await supabase
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
  const [companyResult, whatsappSessionResult, usersResult, materialsResult, thresholdsResult] = await Promise.all([
    // Company info
    company_id
      ? supabase.from("companies").select("name, telegram_connected").eq("id", company_id).single()
      : Promise.resolve({ data: null, error: null }),

    // Свой шлюз WhatsApp: одна строка на компанию.
    company_id
      ? supabase
          .from("whatsapp_sessions")
          .select("status, phone_number")
          .eq("company_id", company_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),

    // Users list — сбой чтения не должен выглядеть как «в команде никого нет»
    company_id && isAdmin
      ? listCompanyUsers()
          .then((rows) => ({ users: rows, error: null as string | null }))
          .catch((e: unknown) => ({
            users: [] as UserRows,
            error: e instanceof Error ? e.message : "unknown",
          }))
      : Promise.resolve({ users: [] as UserRows, error: null as string | null }),

    // Materials (for threshold settings)
    company_id && (isAdmin || canEditCompany)
      ? supabase.from("materials").select("id, name, unit").eq("company_id", company_id).order("name")
      : Promise.resolve({ data: [] }),

    // Existing thresholds
    company_id && (isAdmin || canEditCompany)
      ? supabase.from("material_thresholds").select("material_id, min_quantity").eq("company_id", company_id)
      : Promise.resolve({ data: [] }),
  ]);

  // ── Ошибки чтения: сбой ≠ пустые настройки ──────────────
  const readErrorOf = (result: unknown): string | null => {
    const error = (result as { error?: { message?: string } | null } | null)?.error;
    return error ? error.message ?? "unknown" : null;
  };

  const readErrors = {
    profile: profileError?.message ?? null,
    company: readErrorOf(companyResult),
    whatsapp: readErrorOf(whatsappSessionResult),
    users: usersResult.error,
    materials: readErrorOf(materialsResult),
    thresholds: readErrorOf(thresholdsResult),
  };
  type ReadKey = keyof typeof readErrors;

  const failedKeys = (Object.keys(readErrors) as ReadKey[]).filter((k) => readErrors[k]);
  for (const key of failedKeys) {
    console.error(`[settings] не удалось загрузить ${READ_ERROR_LABELS[key]}:`, readErrors[key]);
  }
  const failedSections = failedKeys.map((k) => READ_ERROR_LABELS[k]);

  // Всё, кроме материалов/порогов, выводится в карточках напрямую: при сбое
  // этих запросов страница выглядела бы как «настроек нет / ничего не подключено».
  const criticalFailed = failedKeys.some((k) => k !== "materials" && k !== "thresholds");
  const thresholdsFailed = Boolean(readErrors.materials || readErrors.thresholds);

  if (criticalFailed) {
    return (
      <div className="p-4 sm:p-6 max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[var(--text)]">Настройки</h1>
        </div>
        <div
          role="alert"
          className="flex flex-col items-center justify-center py-20 text-center bg-[var(--card)] rounded-xl border border-[var(--border)]"
        >
          <div className="w-14 h-14 rounded-2xl bg-[var(--danger-bg)] flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-[var(--danger)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-[var(--text)] mb-1">
            Не удалось загрузить настройки
          </p>
          <p className="text-xs text-[var(--muted)] mb-4 max-w-sm">
            Данные не получены — это не значит, что настройки пусты.
            Не удалось прочитать: {failedSections.join(", ")}. Повторите попытку.
          </p>
          <RefreshButton className="dp-btn-primary rounded-xl">
            Обновить
          </RefreshButton>
        </div>
      </div>
    );
  }

  // ── Derived values ──────────────────────────────────────
  const companyName = companyResult.data?.name ?? "—";
  const telegramConnected = companyResult.data?.telegram_connected ?? false;

  const whatsappSession = whatsappSessionResult.data as
    | { status?: string; phone_number?: string | null }
    | null;
  const isConnected = whatsappSession?.status === "open";
  const phoneNumber = whatsappSession?.phone_number ?? null;

  const users: UserRows = usersResult.users;
  const materials = (materialsResult as { data: { id: string; name: string; unit: string }[] | null }).data ?? [];
  const thresholds = (thresholdsResult as { data: { material_id: string; min_quantity: number }[] | null }).data ?? [];

  const thresholdSection = !canEditCompany ? null : thresholdsFailed ? (
    <div className="mt-6">
      <h3 className="text-sm font-semibold text-[var(--text)] mb-3">Пороги остатков (Telegram-алерты)</h3>
      <div
        role="alert"
        className="flex items-center gap-2 rounded-lg border border-[var(--danger)]/40 bg-[var(--danger-bg)] px-3.5 py-2.5 text-xs text-[var(--danger)]"
      >
        <span className="flex-1 min-w-0">
          Не удалось загрузить {readErrors.materials ? "материалы" : "пороги остатков"} —
          значения не показаны, чтобы сбой не выглядел как отсутствие порогов.
        </span>
        <RefreshButton className="shrink-0 font-semibold underline underline-offset-2">
          Обновить
        </RefreshButton>
      </div>
    </div>
  ) : (
    <div className="mt-6">
      <h3 className="text-sm font-semibold text-[var(--text)] mb-3">Пороги остатков (Telegram-алерты)</h3>
      <p className="text-xs text-[var(--muted)] mb-4">
        Укажите минимальный остаток для каждого материала. При достижении порога придёт Telegram-уведомление.
      </p>
      <MaterialThresholds materials={materials} initialThresholds={thresholds} />
    </div>
  );

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
      // WhatsApp
      isConnected={isConnected}
      phoneNumber={phoneNumber}
      // Users
      users={users}
      // Meta
      isAdmin={isAdmin}
      canEditCompany={canEditCompany}
      initialTab={initialTab}
      thresholdSection={thresholdSection}
    />
  );
}
