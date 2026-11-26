-- 059_billing_support_devices.sql
-- ============================================================
-- AD Pulse — биллинг, поддержка, устройства входа
-- ============================================================
-- Что появляется:
--   plan_offers        каталог тарифов (цены из PLAN_PRODAZH_AD_PULSE.md, §7.1)
--   subscriptions      подписка компании: план, статус, период, пилот
--   billing_invoices   счета (онлайн-оплата или счёт на email)
--   billing_events     журнал вебхуков и напоминаний (dedupe_key)
--   support_requests   обращения в поддержку → altai.dx@gmail.com
--   user_devices       доверенные устройства и IP входов
--
-- Плюс:
--   private.company_can_write() — гейт «только чтение» после 7 дней просрочки;
--     навешивается RESTRICTIVE-политиками на учётные таблицы. Пока подписки
--     нет (старые компании до миграции) — fail-open: писать можно.
--   public.billing_provision_signup() — атомарно создаёт компанию, профиль
--     админа и 30-дневный пилот при self-serve регистрации.
--   public.billing_mark_invoice_paid() — идемпотентно отмечает счёт оплаченным
--     и продлевает подписку.
--
-- Права: обе RPC только для service_role. RLS включён на всех новых таблицах.
-- Применять ВРУЧНУЮ в Supabase SQL Editor. Скрипт идемпотентный.

BEGIN;

-- ─── 1. Каталог тарифов ──────────────────────────────────────────────────────

create table if not exists public.plan_offers (
  code            text primary key,
  name            text not null,
  monthly_price   integer not null check (monthly_price >= 0),
  wa_numbers      integer not null default 0,
  wa_addon_price  integer not null default 0,
  summary         text not null default '',
  sort_order      integer not null default 0
);

insert into public.plan_offers (code, name, monthly_price, wa_numbers, wa_addon_price, summary, sort_order)
values
  ('trial',   'Пилот', 0,     0, 0,     '30 дней бесплатно, все функции', 0),
  ('start',   'Старт', 14900, 0, 14900, '1 склад, учёт, планы, отчёты, Telegram-алерты', 1),
  ('plant',   'Завод', 29900, 1, 0,     'До 3 цехов, WhatsApp включён, все отчёты', 2),
  ('network', 'Сеть',  54900, 2, 0,     'Без лимита цехов, 2 WhatsApp-номера, приоритетная поддержка', 3)
on conflict (code) do update set
  name           = excluded.name,
  monthly_price  = excluded.monthly_price,
  wa_numbers     = excluded.wa_numbers,
  wa_addon_price = excluded.wa_addon_price,
  summary        = excluded.summary,
  sort_order     = excluded.sort_order;

alter table public.plan_offers enable row level security;

drop policy if exists "plan_offers: read for everyone" on public.plan_offers;
create policy "plan_offers: read for everyone"
  on public.plan_offers for select
  to anon, authenticated
  using (true);

-- Цены видны и на публичной странице тарифов, и в кабинете.
grant select on public.plan_offers to anon, authenticated;

-- ─── 2. Подписки ─────────────────────────────────────────────────────────────

create table if not exists public.subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null unique references public.companies(id) on delete cascade,
  plan_code            text not null default 'trial' references public.plan_offers(code),
  status               text not null default 'trialing'
                         check (status in ('trialing', 'active', 'past_due', 'blocked', 'canceled')),
  billing_period       text not null default 'monthly'
                         check (billing_period in ('monthly', 'yearly')),
  wa_addon             boolean not null default false,
  billing_email        text,
  trial_ends_at        timestamptz,
  current_period_start timestamptz,
  current_period_end   timestamptz,
  amount               integer,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists subscriptions_status_period_idx
  on public.subscriptions (status, current_period_end);

alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions: members can select" on public.subscriptions;
create policy "subscriptions: members can select"
  on public.subscriptions for select
  to authenticated
  using (company_id = private.get_my_company_id());

-- Запись — только service_role: клиент не может выдать себе тариф.

-- ─── 3. Счета ────────────────────────────────────────────────────────────────

create table if not exists public.billing_invoices (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies(id) on delete cascade,
  number              text not null unique,
  plan_code           text not null references public.plan_offers(code),
  billing_period      text not null check (billing_period in ('monthly', 'yearly')),
  wa_addon            boolean not null default false,
  amount              integer not null check (amount >= 0),
  currency            text not null default 'KZT',
  status              text not null default 'pending'
                        check (status in ('pending', 'paid', 'canceled', 'expired')),
  period_start        date,
  period_end          date,
  due_at              timestamptz,
  paid_at             timestamptz,
  provider            text not null default 'manual',
  provider_payment_id text,
  payment_url         text,
  created_at          timestamptz not null default now()
);

create unique index if not exists billing_invoices_provider_payment_idx
  on public.billing_invoices (provider, provider_payment_id)
  where provider_payment_id is not null;

create index if not exists billing_invoices_company_created_idx
  on public.billing_invoices (company_id, created_at desc);

alter table public.billing_invoices enable row level security;

drop policy if exists "billing_invoices: members can select" on public.billing_invoices;
create policy "billing_invoices: members can select"
  on public.billing_invoices for select
  to authenticated
  using (company_id = private.get_my_company_id());

-- ─── 4. Журнал биллинга (вебхуки, напоминания) ───────────────────────────────

create table if not exists public.billing_events (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references public.companies(id) on delete cascade,
  invoice_id  uuid references public.billing_invoices(id) on delete set null,
  type        text not null,
  dedupe_key  text unique,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists billing_events_company_idx
  on public.billing_events (company_id, created_at desc);

alter table public.billing_events enable row level security;
-- Политик нет: только service_role.

-- ─── 5. Обращения в поддержку ────────────────────────────────────────────────

create table if not exists public.support_requests (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references public.companies(id) on delete set null,
  user_id     uuid references public.profiles(id) on delete set null,
  name        text,
  email       text not null,
  subject     text not null,
  message     text not null,
  source      text not null default 'dashboard' check (source in ('dashboard', 'public')),
  status      text not null default 'new' check (status in ('new', 'answered', 'closed')),
  emailed_at  timestamptz,
  email_error text,
  created_at  timestamptz not null default now()
);

create index if not exists support_requests_created_idx
  on public.support_requests (created_at desc);

alter table public.support_requests enable row level security;
-- Политик нет: формы пишут через service_role на сервере.

-- ─── 6. Устройства и IP входов ───────────────────────────────────────────────

create table if not exists public.user_devices (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  ip            text,
  user_agent    text,
  trusted       boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  notified_at   timestamptz
);

create unique index if not exists user_devices_unique_idx
  on public.user_devices (user_id, coalesce(ip, ''), coalesce(user_agent, ''));

alter table public.user_devices enable row level security;

drop policy if exists "user_devices: select own" on public.user_devices;
create policy "user_devices: select own"
  on public.user_devices for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "user_devices: delete own" on public.user_devices;
create policy "user_devices: delete own"
  on public.user_devices for delete
  to authenticated
  using (user_id = auth.uid());

-- ─── 7. Гейт «только чтение» после просрочки ─────────────────────────────────
-- Возвращает false, когда подписка заблокирована или просрочена больше 7 дней.
-- Нет строки подписки (компании до миграции) → true: старые клиенты не ломаются.

create or replace function private.company_can_write(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select case
      when s.status in ('blocked', 'canceled') then false
      when s.status = 'past_due' then
        now() <= coalesce(s.current_period_end, s.trial_ends_at, s.created_at) + interval '7 days'
      else true
    end
    from public.subscriptions s
    where s.company_id = p_company_id
  ), true);
$$;

grant execute on function private.company_can_write(uuid) to authenticated;

-- RESTRICTIVE-политики складываются по AND с обычными: пока гейт открыт,
-- поведение таблиц не меняется; после просрочки запись отсекается на уровне БД,
-- в том числе для прямых запросов через anon-ключ.
do $$
declare
  t text;
begin
  foreach t in array array['materials', 'material_transactions', 'production_plans']
  loop
    execute format('drop policy if exists "billing gate: insert" on public.%I', t);
    execute format(
      'create policy "billing gate: insert" on public.%I as restrictive for insert with check (private.company_can_write(company_id))', t);
    execute format('drop policy if exists "billing gate: update" on public.%I', t);
    execute format(
      'create policy "billing gate: update" on public.%I as restrictive for update using (private.company_can_write(company_id)) with check (private.company_can_write(company_id))', t);
    execute format('drop policy if exists "billing gate: delete" on public.%I', t);
    execute format(
      'create policy "billing gate: delete" on public.%I as restrictive for delete using (private.company_can_write(company_id))', t);
  end loop;
end $$;

-- ─── 8. Self-serve: компания + админ + пилот одной транзакцией ───────────────

create or replace function public.billing_provision_signup(
  p_user_id       uuid,
  p_company_name  text,
  p_full_name     text,
  p_billing_email text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
  v_name       text;
begin
  select company_id into v_company_id
  from public.profiles
  where id = p_user_id;

  if v_company_id is not null then
    return v_company_id;
  end if;

  v_name := left(coalesce(nullif(btrim(p_company_name), ''), 'Новая компания'), 160);

  insert into public.companies (name) values (v_name) returning id into v_company_id;

  insert into public.profiles (id, company_id, role, full_name)
  values (
    p_user_id,
    v_company_id,
    'admin',
    left(coalesce(nullif(btrim(p_full_name), ''), p_billing_email, 'Администратор'), 120)
  );

  insert into public.subscriptions (
    company_id, plan_code, status, billing_period, billing_email,
    trial_ends_at, current_period_start, current_period_end, amount
  )
  values (
    v_company_id, 'trial', 'trialing', 'monthly', nullif(btrim(p_billing_email), ''),
    now() + interval '30 days', now(), now() + interval '30 days', 0
  )
  on conflict (company_id) do nothing;

  return v_company_id;
end $$;

revoke all on function public.billing_provision_signup(uuid, text, text, text) from public;
revoke all on function public.billing_provision_signup(uuid, text, text, text) from anon;
revoke all on function public.billing_provision_signup(uuid, text, text, text) from authenticated;
grant execute on function public.billing_provision_signup(uuid, text, text, text) to service_role;

-- ─── 9. Оплата счёта: идемпотентно, с продлением подписки ───────────────────

create or replace function public.billing_mark_invoice_paid(
  p_invoice_id uuid,
  p_provider   text default 'manual',
  p_payment_id text default null
)
returns table (
  billing_company_id uuid,
  already_paid       boolean,
  billing_amount     integer,
  billing_plan_code  text,
  billing_period_end timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invoice public.billing_invoices%rowtype;
  v_sub     public.subscriptions%rowtype;
  v_start   timestamptz;
  v_end     timestamptz;
  v_step    interval;
begin
  select * into v_invoice from public.billing_invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Счёт % не найден', p_invoice_id;
  end if;

  if v_invoice.status = 'paid' then
    return query select v_invoice.company_id, true, v_invoice.amount, v_invoice.plan_code,
                        (select s.current_period_end from public.subscriptions s where s.company_id = v_invoice.company_id);
    return;
  end if;

  update public.billing_invoices
     set status              = 'paid',
         paid_at             = now(),
         provider            = coalesce(nullif(btrim(p_provider), ''), provider),
         provider_payment_id = coalesce(p_payment_id, provider_payment_id)
   where id = p_invoice_id;

  select * into v_sub from public.subscriptions where company_id = v_invoice.company_id for update;

  v_step := case when v_invoice.billing_period = 'yearly' then interval '1 year' else interval '1 month' end;

  -- Продление того же плана поверх оплаченного периода не сжигает остаток дней.
  if v_sub.company_id is not null
     and v_sub.current_period_end is not null
     and v_sub.current_period_end > now()
     and v_sub.plan_code = v_invoice.plan_code then
    v_start := v_sub.current_period_end;
  else
    v_start := now();
  end if;
  v_end := v_start + v_step;

  if v_sub.company_id is null then
    insert into public.subscriptions (
      company_id, plan_code, status, billing_period, wa_addon, billing_email,
      current_period_start, current_period_end, amount
    )
    values (
      v_invoice.company_id, v_invoice.plan_code, 'active', v_invoice.billing_period,
      v_invoice.wa_addon, null, v_start, v_end, v_invoice.amount
    );
  else
    update public.subscriptions
       set plan_code            = v_invoice.plan_code,
           status               = 'active',
           billing_period       = v_invoice.billing_period,
           wa_addon             = v_invoice.wa_addon,
           current_period_start = v_start,
           current_period_end   = v_end,
           amount               = v_invoice.amount,
           updated_at           = now()
     where company_id = v_invoice.company_id;
  end if;

  return query select v_invoice.company_id, false, v_invoice.amount, v_invoice.plan_code, v_end;
end $$;

revoke all on function public.billing_mark_invoice_paid(uuid, text, text) from public;
revoke all on function public.billing_mark_invoice_paid(uuid, text, text) from anon;
revoke all on function public.billing_mark_invoice_paid(uuid, text, text) from authenticated;
grant execute on function public.billing_mark_invoice_paid(uuid, text, text) to service_role;

COMMIT;

-- ─── Проверка после применения ───────────────────────────────────────────────
-- select code, monthly_price from public.plan_offers order by sort_order;
-- select count(*) from public.subscriptions;
-- select policyname, cmd, permissive from pg_policies
--   where tablename = 'materials' order by policyname;
-- Ожидаем: plan_offers заполнен, у materials 3 restrictive-политики "billing gate: *".
