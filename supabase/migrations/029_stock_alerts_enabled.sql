-- ============================================================
-- AD Pulse — переключатель алертов критического остатка по компании
-- ============================================================
-- Не затрагивает алерты о браке и перерасходе плана — только
-- "📦 Критический остаток" (норма ГОСТ < 10%), проверяется в коде
-- (fireAlerts в transactions/actions.ts и lib/wazzup/parseAndSave.ts)
-- перед отправкой.

ALTER TABLE companies ADD COLUMN IF NOT EXISTS stock_alerts_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN companies.stock_alerts_enabled IS
  'Если false — алерт "Критический остаток" (норма ГОСТ < 10%) не отправляется в Telegram. Брак и перерасход плана не затрагиваются.';

UPDATE companies
   SET stock_alerts_enabled = false
 WHERE id = 'ab426af3-ba63-4137-b7c6-368b425f934e';
