-- 058_fix_wazzup_view_security.sql
-- СРОЧНО: закрыть утечку через view public.wazzup_messages.
--
-- Проблема: view создан без `security_invoker`, поэтому выполнялся от имени
-- владельца (postgres) и обходил RLS. Проверено практически: анонимный запрос
-- с публичным anon-ключом возвращал строки — то есть любой мог прочитать
-- сообщения всех компаний:
--
--   GET /rest/v1/wazzup_messages?select=id   →  [{...},{...},{...}]
--   GET /rest/v1/whatsapp_messages?select=id →  []   (RLS работает)
--
-- Применять НЕМЕДЛЕННО в Supabase Dashboard → SQL Editor.
-- Первая строка файла закрывает доступ, остальное можно запускать следом.

-- ─── 1. Закрыть утечку прямо сейчас ──────────────────────────────────────────
-- Вариант А (минимальный, оставляет совместимость для старого деплоя):
alter view public.wazzup_messages set (security_invoker = on);

-- ─── 2. Полная зачистка (после деплоя нового кода) ───────────────────────────
-- Новый код читает whatsapp_messages напрямую, view ему не нужен.
-- Если деплой уже прошёл — можно выполнить всё вместе с пунктом 1.

-- Проверить, что деплой прошёл, можно так: в логах приложения больше нет
-- обращений к wazzup_messages, а /api/whatsapp/webhook отвечает 401 без токена.

drop view if exists public.wazzup_messages;

drop trigger if exists material_transactions_sync_message_id on public.material_transactions;
drop function if exists public.sync_tx_whatsapp_message_id();

alter table public.material_transactions
  drop column if exists wazzup_message_id;

-- ─── 3. Проверка ─────────────────────────────────────────────────────────────
-- 1) view не существует:
--    select count(*) from information_schema.views
--     where table_schema='public' and table_name='wazzup_messages';   -- 0
--
-- 2) анонимный запрос не отдаёт данные:
--    GET /rest/v1/whatsapp_messages?select=id  →  []
--
-- 3) остались только эти таблицы:
--    select table_name from information_schema.tables
--     where table_schema='public' and (table_name like '%azzup%' or table_name like 'whatsapp%');
