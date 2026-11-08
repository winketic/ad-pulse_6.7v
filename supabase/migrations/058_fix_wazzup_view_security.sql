-- 058_fix_wazzup_view_security.sql
-- Завершение перехода: закрыть утечку через view и убрать остатки Wazzup.
--
-- ИСТОРИЯ: view wazzup_messages был создан без `security_invoker` и обходил RLS —
-- анонимный запрос с публичным anon-ключом читал сообщения компании. View уже
-- удалён при первом применении миграции. Этот файл переписан так, чтобы его
-- можно было безопасно запускать ПОВТОРНО: все шаги идемпотентны.
--
-- Применять вручную в Supabase Dashboard → SQL Editor.

-- ─── 1. Закрыть утечку, если view ещё существует ────────────────────────────
do $$
begin
  if exists (
    select 1 from information_schema.views
    where table_schema = 'public' and table_name = 'wazzup_messages'
  ) then
    execute 'alter view public.wazzup_messages set (security_invoker = on)';
    execute 'drop view public.wazzup_messages';
    raise notice 'view wazzup_messages закрыт и удалён';
  else
    raise notice 'view wazzup_messages уже отсутствует — шаг пропущен';
  end if;
end $$;

-- ─── 2. Старая колонка и синхронизация ──────────────────────────────────────
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'material_transactions'
      and column_name = 'wazzup_message_id'
  ) then
    execute 'drop trigger if exists material_transactions_sync_message_id on public.material_transactions';
    execute 'drop function if exists public.sync_tx_whatsapp_message_id()';
    execute 'alter table public.material_transactions drop column wazzup_message_id';
    raise notice 'старая колонка wazzup_message_id удалена';
  else
    raise notice 'колонки wazzup_message_id уже нет — шаг пропущен';
  end if;
end $$;

-- ─── 3. Мёртвая функция от прежней интеграции ───────────────────────────────
-- Обращается к удалённой wazzup_tokens: вызов возвращал 42P01.
drop function if exists public.get_wazzup_status();

-- ─── 4. Политика RLS: нейтральное имя вместо прежнего ───────────────────────
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'whatsapp_messages'
  ) then
    execute 'drop policy if exists "wazzup_msg: members can select own company" on public.whatsapp_messages';
    execute 'drop policy if exists whatsapp_messages_select on public.whatsapp_messages';
    execute 'create policy whatsapp_messages_select on public.whatsapp_messages
               for select using (company_id = private.get_my_company_id())';
    raise notice 'политика переименована в whatsapp_messages_select';
  end if;
end $$;

-- ─── 5. Проверка ─────────────────────────────────────────────────────────────
-- select table_name, table_type from information_schema.tables
--  where table_schema = 'public' and (table_name like '%azzup%' or table_name like 'whatsapp%');
-- Ожидаем: whatsapp_messages, whatsapp_sessions, whatsapp_chats. Больше ничего.
--
-- Анонимный запрос к удалённому view должен возвращать ошибку «таблицы нет»:
--   GET /rest/v1/wazzup_messages?select=id   →  404 / PGRST205
