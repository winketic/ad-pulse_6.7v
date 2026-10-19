"use client";

import { useMemo, useState } from "react";
import { Building2, Clock3, Search, Users } from "lucide-react";

export type PlatformCompany = {
  id: string;
  name: string;
  created_at: string;
  users: number;
  lastSeen: string | null;
  activeThisWeek: boolean;
};

type Filter = "all" | "active" | "inactive";

function formatDate(value: string | null) {
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

export default function PlatformCompaniesClient({ companies }: { companies: PlatformCompany[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const visibleCompanies = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ru");
    return companies.filter((company) => {
      const matchesFilter = filter === "all" || company.activeThisWeek === (filter === "active");
      return matchesFilter && company.name.toLocaleLowerCase("ru").includes(normalizedQuery);
    });
  }, [companies, filter, query]);

  const filters: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: "Все", count: companies.length },
    { id: "active", label: "Активны за 7 дней", count: companies.filter((item) => item.activeThisWeek).length },
    { id: "inactive", label: "Без активности", count: companies.filter((item) => !item.activeThisWeek).length },
  ];

  return (
    <section aria-label="Компании">
      <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 sm:p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2" aria-label="Фильтр компаний">
          {filters.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
              className={`min-h-10 rounded-xl px-3 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${filter === item.id ? "bg-[var(--accent-15)] text-[var(--accent)]" : "text-[var(--muted)] hover:bg-white/5 hover:text-[var(--text)]"}`}
            >
              {item.label}<span className="ml-2 tabular-nums opacity-70">{item.count}</span>
            </button>
          ))}
        </div>
        <label className="relative block w-full lg:max-w-xs">
          <Search size={17} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          <span className="sr-only">Поиск по компаниям</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Найти компанию"
            className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] pl-10 pr-3 text-sm text-[var(--text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
          />
        </label>
      </div>

      <p className="mb-3 px-1 text-xs text-[var(--muted)]" aria-live="polite">
        Показано {visibleCompanies.length} из {companies.length}
      </p>

      {visibleCompanies.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] px-6 py-14 text-center">
          <Building2 size={24} className="mx-auto mb-3 text-[var(--muted)]" />
          <p className="font-medium text-[var(--text)]">Компании не найдены</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Измените запрос или выберите другой фильтр.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
          <div className="hidden grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,0.7fr)_auto] gap-4 border-b border-[var(--border)] bg-white/[0.02] px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)] md:grid">
            <span>Компания</span><span>Последний вход</span><span>Команда</span><span>Активность</span>
          </div>
          <ul className="divide-y divide-[var(--border)]">
            {visibleCompanies.map((company) => (
              <li key={company.id} className="grid gap-3 px-4 py-4 transition-colors hover:bg-white/[0.02] sm:px-5 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,0.7fr)_auto] md:items-center md:gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--accent)]/15 bg-[var(--accent-15)] text-[var(--accent)]"><Building2 size={18} /></span>
                  <div className="min-w-0"><p className="truncate text-sm font-semibold text-[var(--text)]">{company.name}</p><p className="mt-0.5 text-xs text-[var(--muted)]">Подключена {formatDate(company.created_at).split(",")[0]}</p></div>
                </div>
                <p className="flex items-center gap-2 text-sm text-[var(--muted)]"><Clock3 size={15} className="shrink-0" /><span>{formatDate(company.lastSeen)}</span></p>
                <p className="flex items-center gap-2 text-sm text-[var(--muted)]"><Users size={15} className="shrink-0" /><span>{company.users} сотрудников</span></p>
                <span className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${company.activeThisWeek ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400" : "border-amber-500/20 bg-amber-500/10 text-amber-300"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${company.activeThisWeek ? "bg-emerald-400" : "bg-amber-300"}`} />
                  {company.activeThisWeek ? "Активна" : "Нет входов 7 дней"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
