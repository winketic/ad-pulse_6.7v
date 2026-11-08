-- 057_drop_wazzup_remnants.sql
-- Шаг 2 из 2: окончательная зачистка Wazzup.
--
-- ПРИМЕНЯТЬ ПОСЛЕ того, как новый код задеплоен и проверен.
-- До деплоя эту миграцию запускать НЕЛЬЗЯ: старый деплой ещё читает
-- view `wazzup_messages`, колонку `wazzup_message_id` и таблицы токенов.
--
-- Применять вручную в Supabase Dashboard → SQL Editor. Скрипт идемпотентный.

-- ─── 1. Убрать совместимый view ──────────────────────────────────────────────
drop view if exists public.wazzup_messages;

-- ─── 2. Убрать устаревшую колонку и синхронизацию ────────────────────────────
drop trigger if exists material_transactions_sync_message_id on public.material_transactions;
drop function if exists public.sync_tx_whatsapp_message_id();

-- Индекс на старую колонку удалится вместе с колонкой.
alter table public.material_transactions
  drop column if exists wazzup_message_id;

-- ─── 3. Убрать таблицы Wazzup ────────────────────────────────────────────────
-- Подключение идёт через собственный шлюз: токены и партнёрский конфиг
-- Wazzup больше не используются, сессии хранятся на нашем сервере.
drop table if exists public.wazzup_tokens cascade;
drop table if exists public.wazzup_config cascade;

-- ─── 4. Проверка ─────────────────────────────────────────────────────────────
-- select table_name, table_type from information_schema.tables
--  where table_schema='public' and (table_name like '%azzup%' or table_name like 'whatsapp%');
--
-- Ожидаем только: whatsapp_messages, whatsapp_sessions, whatsapp_chats.
