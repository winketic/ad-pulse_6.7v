-- 056_rename_wazzup_tables.sql
-- Убираем Wazzup из схемы БД: переименовываем таблицы под собственный шлюз.
--
-- ВАЖНО: миграция написана так, чтобы её можно было применить ДО деплоя нового
-- кода. Старый деплой продолжит работать: для сообщений создаётся совместимый
-- view с прежним именем, а колонка-ссылка в транзакциях синхронизируется триггером.
-- Удалять совместимость будет отдельная миграция после деплоя (057).
--
-- Применять вручную в Supabase Dashboard → SQL Editor. Скрипт идемпотентный.

-- ─── 1. Сообщения: wazzup_messages → whatsapp_messages ───────────────────────
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'wazzup_messages'
      and table_type = 'BASE TABLE'
  ) then
    alter table public.wazzup_messages rename to whatsapp_messages;
  end if;
end $$;

-- Совместимость: пока в проде старый код, он читает и пишет в это имя.
-- Простой view в Postgres автоматически обновляемый, поэтому INSERT работает.
create or replace view public.wazzup_messages as
  select * from public.whatsapp_messages;

-- ─── 2. Ссылка из транзакций на сообщение ────────────────────────────────────
alter table public.material_transactions
  add column if not exists whatsapp_message_id uuid
  references public.whatsapp_messages(id) on delete set null;

update public.material_transactions
   set whatsapp_message_id = wazzup_message_id
 where whatsapp_message_id is null
   and wazzup_message_id is not null;

create index if not exists idx_mat_tx_whatsapp_msg
  on public.material_transactions(whatsapp_message_id)
  where whatsapp_message_id is not null;

-- Пока старый код пишет в wazzup_message_id, а новый — в whatsapp_message_id,
-- держим обе колонки одинаковыми.
create or replace function public.sync_tx_whatsapp_message_id()
returns trigger
language plpgsql
as $$
begin
  new.whatsapp_message_id := coalesce(new.whatsapp_message_id, new.wazzup_message_id);
  new.wazzup_message_id  := coalesce(new.wazzup_message_id, new.whatsapp_message_id);
  return new;
end;
$$;

drop trigger if exists material_transactions_sync_message_id on public.material_transactions;
create trigger material_transactions_sync_message_id
  before insert or update on public.material_transactions
  for each row execute function public.sync_tx_whatsapp_message_id();

-- ─── 3. Wazzup-токены и конфиг больше не нужны ───────────────────────────────
-- Данные Wazzup больше не используются: подключение идёт через свой шлюз,
-- а он хранит сессии на своём сервере, не в Supabase.
drop table if exists public.wazzup_tokens cascade;
drop table if exists public.wazzup_config cascade;

-- ─── 4. Проверка ─────────────────────────────────────────────────────────────
-- select table_name, table_type from information_schema.tables
--  where table_schema='public' and table_name like '%azzup%' or table_name like 'whatsapp%';
--
-- Ожидаем: whatsapp_messages (BASE TABLE), wazzup_messages (VIEW),
--          whatsapp_sessions, whatsapp_chats. wazzup_tokens/wazzup_config — нет.
