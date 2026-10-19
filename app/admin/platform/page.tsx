import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { Building2, CalendarClock, ChevronRight, CircleCheck, Clock3, Users } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isPlatformOwnerEmail } from "@/lib/auth/platform-owner";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type CompanyRow = { id: string; name: string; created_at: string };

function formatLastSeen(value: string | null) {
  if (!value) return "Пока не входили";
  return new Date(value).toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function PlatformOverviewPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isPlatformOwnerEmail(user.email)) notFound();

  const service = createServiceClient();
  const [companiesResult, profilesResult, registrationsResult] = await Promise.all([
    service.from("companies").select("id, name, created_at").order("created_at", { ascending: false }),
    service.from("profiles").select("id, company_id"),
    service.from("registrations").select("id, status"),
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

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const companies = (companiesResult.data ?? [] as CompanyRow[]).map((company) => {
    const stats = statsByCompany.get(company.id) ?? { users: 0, lastSeen: null };
    return { ...company, ...stats, activeThisWeek: !!stats.lastSeen && Date.parse(stats.lastSeen) >= weekAgo };
  });
  const activeCount = companies.filter((company) => company.activeThisWeek).length;
  const pendingCount = (registrationsResult.data ?? []).filter((registration) => registration.status === "pending").length;

  return (
    <div className="min-h-full px-4 py-6 sm:px-6 lg:px-8" style={{ background: "var(--bg)" }}>
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">AD Pulse · платформа</p>
            <h1 className="text-2xl font-bold text-[var(--text)] sm:text-3xl">Обзор компаний</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">Сводка активности за последние 7 дней. Данные учёта компаний здесь не отображаются.</p>
          </div>
          <Link href="/admin/registrations" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-text)] hover:opacity-90">
            Заявки {pendingCount > 0 && <span className="rounded-full bg-black/10 px-2 py-0.5">{pendingCount}</span>}
            <ChevronRight size={16} />
          </Link>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SummaryCard icon={<Building2 size={18} />} label="Всего компаний" value={companies.length} />
          <SummaryCard icon={<CircleCheck size={18} />} label="Активны за 7 дней" value={activeCount} />
          <SummaryCard icon={<CalendarClock size={18} />} label="Новые заявки" value={pendingCount} href="/admin/registrations" />
        </div>

        {companies.length === 0 ? (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-6 py-16 text-center text-sm text-[var(--muted)]">Компаний пока нет</div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
            <div className="hidden grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-4 border-b border-[var(--border)] px-5 py-3 text-xs font-medium uppercase tracking-wide text-[var(--muted)] md:grid">
              <span>Компания</span><span>Последний вход</span><span>Команда</span><span>Статус</span>
            </div>
            <ul className="divide-y divide-[var(--border)]">
              {companies.map((company) => (
                <li key={company.id} className="grid gap-3 px-4 py-4 sm:px-5 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center md:gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-15)] text-[var(--accent)]"><Building2 size={18} /></span>
                    <div className="min-w-0"><p className="truncate text-sm font-semibold text-[var(--text)]">{company.name}</p><p className="text-xs text-[var(--muted)]">Подключена {formatLastSeen(company.created_at).split(",")[0]}</p></div>
                  </div>
                  <p className="flex items-center gap-2 text-sm text-[var(--muted)]"><Clock3 size={15} className="shrink-0" />{formatLastSeen(company.lastSeen)}</p>
                  <p className="flex items-center gap-2 text-sm text-[var(--muted)]"><Users size={15} className="shrink-0" />{company.users} сотрудников</p>
                  <span className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-xs font-medium ${company.activeThisWeek ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400" : "border-amber-500/20 bg-amber-500/10 text-amber-300"}`}>
                    {company.activeThisWeek ? "Активна за 7 дней" : "Не заходили 7 дней"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ icon, label, value, href }: { icon: React.ReactNode; label: string; value: number; href?: string }) {
  const content = <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5">
    <div className="mb-3 flex items-center gap-2 text-[var(--muted)]"><span className="text-[var(--accent)]">{icon}</span><span className="text-sm">{label}</span></div>
    <p className="text-3xl font-bold tabular-nums text-[var(--text)]">{value}</p>
  </div>;
  return href ? <Link href={href} className="rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]">{content}</Link> : content;
}
