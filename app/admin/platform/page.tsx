import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, CalendarClock, ChevronRight, CircleCheck, TrendingUp, TriangleAlert } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isPlatformOwnerEmail } from "@/lib/auth/platform-owner";
import PlatformCompaniesClient from "./PlatformCompaniesClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type CompanyRow = { id: string; name: string; created_at: string };

export default async function PlatformOverviewPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isPlatformOwnerEmail(user.email)) notFound();

  const service = createServiceClient();
  const [companiesResult, profilesResult, registrationsResult] = await Promise.all([
    service.from("companies").select("id, name, created_at").order("created_at", { ascending: false }),
    service.from("profiles").select("id, company_id"),
    service.from("registrations").select("id, status, created_at"),
  ]);
  if (companiesResult.error) throw new Error(`Не удалось загрузить список компаний: ${companiesResult.error.message}`);
  if (profilesResult.error) throw new Error(`Не удалось загрузить сводку сотрудников: ${profilesResult.error.message}`);
  if (registrationsResult.error) throw new Error(`Не удалось загрузить сводку заявок: ${registrationsResult.error.message}`);

  // Only aggregate the auth timestamp by company; email, name, and business
  // records from other tenants are never passed to the client.
  const lastSeenByUser = new Map<string, string>();
  for (let page = 1; ; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Не удалось загрузить активность: ${error.message}`);
    const users = data.users ?? [];
    for (const authUser of users) {
      if (authUser.last_sign_in_at) lastSeenByUser.set(authUser.id, authUser.last_sign_in_at);
    }
    if (users.length < 1000) break;
  }

  const profiles = profilesResult.data ?? [];
  const statsByCompany = new Map<string, { users: number; lastSeen: string | null }>();
  for (const profile of profiles) {
    const current = statsByCompany.get(profile.company_id) ?? { users: 0, lastSeen: null };
    current.users += 1;
    const seen = lastSeenByUser.get(profile.id);
    if (seen && (!current.lastSeen || Date.parse(seen) > Date.parse(current.lastSeen))) current.lastSeen = seen;
    statsByCompany.set(profile.company_id, current);
  }

  const now = new Date();
  const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const monthAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const previousMonthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1);
  const companies = (companiesResult.data ?? [] as CompanyRow[]).map((company) => {
    const stats = statsByCompany.get(company.id) ?? { users: 0, lastSeen: null };
    const lastSeenTime = stats.lastSeen ? Date.parse(stats.lastSeen) : null;
    return {
      ...company,
      ...stats,
      activeThisWeek: lastSeenTime !== null && lastSeenTime >= weekAgo,
      needsAttention: stats.users === 0 || lastSeenTime === null || lastSeenTime < monthAgo,
    };
  });
  const activeCount = companies.filter((company) => company.activeThisWeek).length;
  const attentionCount = companies.filter((company) => company.needsAttention).length;
  const registrations = registrationsResult.data ?? [];
  const pendingCount = registrations.filter((registration) => registration.status === "pending").length;
  const stalePendingCount = registrations.filter((registration) =>
    registration.status === "pending" && Date.parse(registration.created_at) < now.getTime() - 48 * 60 * 60 * 1000,
  ).length;
  const newThisMonth = companies.filter((company) => Date.parse(company.created_at) >= monthStart).length;
  const newPreviousMonth = companies.filter((company) => {
    const createdAt = Date.parse(company.created_at);
    return createdAt >= previousMonthStart && createdAt < monthStart;
  }).length;

  return (
    <div className="min-h-full px-4 py-6 sm:px-6 sm:py-8 lg:px-8" style={{ background: "var(--bg)" }}>
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 border-b border-[var(--border)] pb-5">
          <div className="mb-6 flex items-center justify-between gap-3">
            <Link href="/dashboard" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm font-medium text-[var(--muted)] transition-colors hover:border-[var(--accent)]/40 hover:text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
              <ArrowLeft size={16} /> В приложение
            </Link>
            <span className="rounded-full border border-[var(--accent)]/20 bg-[var(--accent-15)] px-3 py-1.5 text-xs font-semibold text-[var(--accent)]">Панель владельца</span>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">AD Pulse · платформа</p>
              <h1 className="text-2xl font-bold tracking-tight text-[var(--text)] sm:text-3xl">Обзор компаний</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">Смотрите, какие компании пользуются платформой. Данные об их материалах, операциях и производстве здесь не показываются.</p>
            </div>
            <Link href="/admin/registrations" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-text)] shadow-sm transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">
              Заявки {pendingCount > 0 && <span className="rounded-full bg-black/10 px-2 py-0.5 tabular-nums">{pendingCount}</span>}
              <ChevronRight size={16} />
            </Link>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <SummaryCard icon={<Building2 size={18} />} label="Всего компаний" value={companies.length} />
          <SummaryCard icon={<CircleCheck size={18} />} label="Активны за 7 дней" value={activeCount} />
          <SummaryCard icon={<TrendingUp size={18} />} label="Новые за месяц" value={newThisMonth} detail={`В прошлом месяце: ${newPreviousMonth}`} />
          <SummaryCard icon={<CalendarClock size={18} />} label="Ждут решения" value={pendingCount} detail={stalePendingCount > 0 ? `${stalePendingCount} ждут больше 48 часов` : "Все заявки в сроке"} href="/admin/registrations" />
        </div>

        {(attentionCount > 0 || stalePendingCount > 0) && (
          <section aria-labelledby="attention-heading" className="mb-6 rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2">
              <TriangleAlert size={18} className="text-amber-300" />
              <h2 id="attention-heading" className="text-sm font-semibold text-[var(--text)]">Требуют внимания</h2>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              {attentionCount > 0 && (
                <a href="#companies" className="inline-flex min-h-11 items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 text-sm text-[var(--text)] transition hover:border-amber-400/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400">
                  <span>Компании, требующие внимания: <strong className="tabular-nums">{attentionCount}</strong></span>
                  <span className="text-xs text-[var(--muted)]">Нет входов 30 дней или сотрудников · список ниже</span>
                </a>
              )}
              {stalePendingCount > 0 && (
                <Link href="/admin/registrations" className="inline-flex min-h-11 items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 text-sm text-[var(--text)] transition hover:border-amber-400/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400">
                  <span>Заявок без решения более 48 часов: <strong className="tabular-nums">{stalePendingCount}</strong></span>
                  <span className="text-xs font-medium text-[var(--accent)]">Открыть заявки <ChevronRight size={14} className="inline" /></span>
                </Link>
              )}
            </div>
          </section>
        )}

        {companies.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] px-6 py-16 text-center">
            <Building2 size={26} className="mx-auto mb-3 text-[var(--muted)]" />
            <p className="font-medium text-[var(--text)]">Компаний пока нет</p>
            <p className="mt-1 text-sm text-[var(--muted)]">После одобрения первой заявки компания появится здесь.</p>
          </div>
        ) : (
          <PlatformCompaniesClient id="companies" companies={companies} />
        )}
      </div>
    </div>
  );
}

function SummaryCard({ icon, label, value, detail, href }: { icon: React.ReactNode; label: string; value: number; detail?: string; href?: string }) {
  const content = <div className="h-full rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 transition-colors sm:p-5">
    <div className="mb-3 flex items-center gap-2 text-[var(--muted)]"><span className="text-[var(--accent)]">{icon}</span><span className="text-sm">{label}</span></div>
    <p className="text-3xl font-bold tabular-nums text-[var(--text)]">{value}</p>
    {detail && <p className="mt-1 text-xs text-[var(--muted)]">{detail}</p>}
  </div>;
  return href ? <Link href={href} className="rounded-2xl hover:[&>div]:border-[var(--accent)]/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]">{content}</Link> : content;
}
