-- 056_rename_wazzup_tables.sql
-- Переименовываем таблицы под собственный шлюз (шаг 1 из 2).
--
-- ПРИМЕНЯТЬ ДО ДЕПЛОЯ нового кода. Миграция совместимая: старый деплой
-- продолжит работать через view с прежним именем и синхронизацию колонки.
-- Окончательная зачистка (drop старого view/колонки/таблиц Wazzup) —
-- в миграции 057, её применяем ПОСЛЕ деплоя.
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

-- Совместимость для старого деплоя: пока новая версия не выкачена, приложение
-- читает и пишет в прежнее имя. Простой view в Postgres обновляемый.
create or replace view public.wazzup_messages as
  select * from public.whatsapp_messages;

-- ВАЖНО: без security_invoker view выполняется от владельца и обходит RLS —
-- тогда любая компания увидела бы чужие сообщения. Включаем права вызывающего.
alter view public.wazzup_messages set (security_invoker = on);

-- Права на view такие же, как были у таблицы (RLS всё равно применяется).
grant select, insert, update on public.wazzup_messages to authenticated;
grant select, insert, update on public.wazzup_messages to service_role;

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

-- Пока старый деплой пишет в wazzup_message_id, а новый — в whatsapp_message_id,
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

-- ─── 3. Проверка ─────────────────────────────────────────────────────────────
-- select table_name, table_type from information_schema.tables
--  where table_schema = 'public' and table_name in ('wazzup_messages','whatsapp_messages');
--
-- Ожидаем: whatsapp_messages — BASE TABLE, wazzup_messages — VIEW.
--
-- select relname, reloptions from pg_class where relname = 'wazzup_messages';
-- Ожидаем в reloptions: {security_invoker=on}.
