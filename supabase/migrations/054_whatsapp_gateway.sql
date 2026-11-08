-- 054_whatsapp_gateway.sql
-- Собственный шлюз WhatsApp (Baileys) вместо Wazzup: сессии, чаты, название чата в сообщении.
--
-- Применять вручную в Supabase Dashboard → SQL Editor.
-- База ОБЩАЯ для staging и production: код должен переживать окно до/после применения
-- (колонки добавляются с DEFAULT / NULL, приложение читает через select("*")).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Сессии WhatsApp: одна компания = один привязанный номер
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.whatsapp_sessions (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  -- Номер в международном формате без +, например 77011234567
  phone_number    text,
  -- Имя профиля WhatsApp (как номер подписан в мессенджере)
  push_name       text,
  -- starting | qr | connecting | open | closed | logged_out | failed
  status          text not null default 'starting',
  -- Заполняется шлюзом, чтобы UI мог показать время последней активности
  connected_at    timestamptz,
  last_seen_at    timestamptz,
  last_error      text,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint whatsapp_sessions_company_unique unique (company_id)
);

create index if not exists whatsapp_sessions_company_idx
  on public.whatsapp_sessions (company_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Чаты: то, из чего клиент выбирает «какие чаты чекать»
--    Клиент видит название, а фильтрация всегда идёт по chat_jid.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.whatsapp_chats (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies(id) on delete cascade,
  -- Идентификатор в WhatsApp: 77011234567@s.whatsapp.net или 1203630...@g.us
  chat_jid          text not null,
  -- Снимок названия для UI. Может меняться, на фильтрацию не влияет.
  chat_name         text not null default '',
  -- whatsapp (личный) | whatsgroup (группа)
  chat_type         text not null default 'whatsapp',
  phone             text,
  last_message_at   timestamptz,
  -- Главный флаг: обрабатывать ли сообщения из этого чата
  is_watched        boolean not null default false,
  -- Показывать ли чат в списке (скрываем мусор вроде статусов)
  is_hidden         boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint whatsapp_chats_jid_unique unique (company_id, chat_jid)
);

create index if not exists whatsapp_chats_company_idx
  on public.whatsapp_chats (company_id, is_watched);
create index if not exists whatsapp_chats_last_message_idx
  on public.whatsapp_chats (company_id, last_message_at desc nulls last);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Сообщения: название чата и провайдер прямо в журнале сообщений.
--    Таблица wazzup_messages остаётся как единый журнал входящих —
--    переименование сделаем отдельной миграцией, когда Wazzup будет отключён.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.wazzup_messages
  add column if not exists chat_name  text,
  add column if not exists chat_type  text,
  add column if not exists provider   text not null default 'wazzup';

create index if not exists wazzup_messages_provider_idx
  on public.wazzup_messages (company_id, provider);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. updated_at триггеры
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists whatsapp_sessions_touch on public.whatsapp_sessions;
create trigger whatsapp_sessions_touch
  before update on public.whatsapp_sessions
  for each row execute function public.touch_updated_at();

drop trigger if exists whatsapp_chats_touch on public.whatsapp_chats;
create trigger whatsapp_chats_touch
  before update on public.whatsapp_chats
  for each row execute function public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RLS: только своя компания. Запись идёт через service role из API-роутов,
--    поэтому политики ограничиваем чтением для участников компании.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.whatsapp_sessions enable row level security;
alter table public.whatsapp_chats    enable row level security;

drop policy if exists whatsapp_sessions_select on public.whatsapp_sessions;
create policy whatsapp_sessions_select on public.whatsapp_sessions
  for select using (
    company_id = (select company_id from public.profiles where id = auth.uid())
  );

drop policy if exists whatsapp_chats_select on public.whatsapp_chats;
create policy whatsapp_chats_select on public.whatsapp_chats
  for select using (
    company_id = (select company_id from public.profiles where id = auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Проверка
-- ─────────────────────────────────────────────────────────────────────────────
-- select table_name, column_name, data_type
-- from information_schema.columns
-- where table_name in ('whatsapp_sessions','whatsapp_chats')
-- order by table_name, ordinal_position;
