-- 055_restore_missing_companies_columns.sql
-- Восстановление колонок companies, которых нет в живой базе.
--
-- Найдено 2026-11-08: в БД (wagtdvhrlisqwwvmridj) у таблицы companies есть только
-- id, name, created_at, whatsapp_enabled, stock_alerts_enabled. Отсутствуют
-- telegram_chat_id, telegram_connected, setup_completed, хотя миграции их создают.
--
-- Последствия отсутствия:
--   telegram_chat_id / telegram_connected — sendTelegramAlert() делает
--     select по этим колонкам, получает ошибку 42703, data = null и МОЛЧА
--     ничего не отправляет. То есть все алерты в Telegram (брак, критический
--     остаток, перерасход, перерасход по плану, отвязка WhatsApp) не работают.
--   setup_completed — экран онбординга не может сохранить завершение настройки.
--
-- Скрипт идемпотентный: применяйте целиком, повторный запуск безопасен.

-- ─── 1. Telegram ─────────────────────────────────────────────────────────────
alter table public.companies
  add column if not exists telegram_chat_id text,
  add column if not exists telegram_connected boolean default false;

-- Вебхук бота ищет компанию по chat_id — без индекса это seq scan.
create index if not exists companies_telegram_chat_idx
  on public.companies (telegram_chat_id)
  where telegram_chat_id is not null;

-- ─── 2. Онбординг ────────────────────────────────────────────────────────────
alter table public.companies
  add column if not exists setup_completed boolean default false;

-- ─── 3. Проверка ─────────────────────────────────────────────────────────────
-- select column_name, data_type
-- from information_schema.columns
-- where table_name = 'companies'
-- order by ordinal_position;
--
-- Ожидаем увидеть: id, name, created_at, whatsapp_enabled, stock_alerts_enabled,
-- telegram_chat_id, telegram_connected, setup_completed.
