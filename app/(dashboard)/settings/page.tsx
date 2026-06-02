import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import WazzupCard from "@/components/settings/WazzupCard";

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
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [profileResult, companyResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, role, company_id")
      .eq("id", user.id)
      .single(),
    // Join with company will be done below
    supabase.from("profiles").select("company_id").eq("id", user.id).single(),
  ]);

  const profile = profileResult.data;
  const company_id = profile?.company_id as string | undefined;

  // Fetch company name
  let companyName = "—";
  if (company_id) {
    const { data: company } = await supabase
      .from("companies")
      .select("name")
      .eq("id", company_id)
      .single();
    companyName = company?.name ?? "—";
  }

  // Fetch Wazzup token status (RLS allows this for company members)
  let isConnected = false;
  let tokenExpiresAt: string | null = null;

  if (company_id) {
    const { data: token } = await supabase
      .from("wazzup_tokens")
      .select("id, expires_at")
      .eq("company_id", company_id)
      .single();

    isConnected = !!token;
    tokenExpiresAt = token?.expires_at ?? null;
  }

  const role = profile?.role ?? "warehouse";
  const roleStyle = ROLE_COLORS[role] ?? ROLE_COLORS.warehouse;
  const initials = (profile?.full_name ?? user.email ?? "U")
    .split(" ")
    .map((w: string) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Настройки</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Управление профилем и интеграциями
        </p>
      </div>

      <div className="space-y-4">
        {/* ── Profile section ──────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Профиль</h2>
          </div>
          <div className="px-5 py-5 flex items-start gap-4">
            {/* Avatar */}
            <div className="w-12 h-12 rounded-xl bg-[#1a472a] flex items-center justify-center shrink-0">
              <span className="text-white text-base font-bold">{initials}</span>
            </div>
            <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-medium text-gray-400 mb-0.5">
                  Полное имя
                </p>
                <p className="text-sm font-medium text-gray-900">
                  {profile?.full_name ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400 mb-0.5">
                  Email
                </p>
                <p className="text-sm text-gray-700 truncate">
                  {user.email ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400 mb-0.5">
                  Роль
                </p>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${roleStyle.bg} ${roleStyle.text}`}
                >
                  {ROLE_LABELS[role] ?? role}
                </span>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400 mb-0.5">
                  ID пользователя
                </p>
                <p className="text-xs text-gray-400 font-mono truncate">
                  {user.id}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Company section ───────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Компания</h2>
          </div>
          <div className="px-5 py-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-medium text-gray-400 mb-0.5">
                Название
              </p>
              <p className="text-sm font-medium text-gray-900">{companyName}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-400 mb-0.5">
                ID компании
              </p>
              <p className="text-xs text-gray-400 font-mono truncate">
                {company_id ?? "—"}
              </p>
            </div>
          </div>
        </div>

        {/* ── WhatsApp / Wazzup section ─────────────────── */}
        <WazzupCard
          isConnected={isConnected}
          expiresAt={tokenExpiresAt}
          flash={searchParams.wazzup ?? null}
        />
      </div>
    </div>
  );
}
