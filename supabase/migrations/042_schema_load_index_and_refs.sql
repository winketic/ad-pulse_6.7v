-- ============================================================
-- AD Pulse — Фаза 1: схема под модель «индекс нагрузки = атрибут ОТГРУЗКИ»
-- ============================================================
-- ПОДГОТОВЛЕНО, НЕ ПРИМЕНЕНО. Применять вручную в Supabase SQL Editor.
-- Аддитивно и безопасно — только новые колонки/таблицы, данные не меняются.
-- Применять ПЕРВОЙ. Затем 043 → 044 → 045.
--
-- Модель: производят и хранят БАЗОВЫЕ марки (3ПБ18, 5ПБ25 — без индекса).
-- Индекс нагрузки (-8/-20/-27/-37) появляется только при ПРОДАЖЕ (отгрузке).
-- Цена = контрагент × базовая марка × индекс нагрузки.

BEGIN;

-- ── material_transactions.load_index ─────────────────────────────────────
-- Заполняется ТОЛЬКО для отгрузки (type='expense'). Для производства
-- (type='income') всегда NULL — производится базовая марка без индекса.
ALTER TABLE material_transactions
  ADD COLUMN IF NOT EXISTS load_index text;

COMMENT ON COLUMN material_transactions.load_index IS
  'Индекс нагрузки при ОТГРУЗКЕ (''8'',''20'',''27'',''37'', …). Только для type=''expense''; для производства (income) всегда NULL.';

-- Инвариант: индекс допустим только на расходе/отгрузке.
ALTER TABLE material_transactions
  DROP CONSTRAINT IF EXISTS mat_tx_load_index_expense_only;
ALTER TABLE material_transactions
  ADD CONSTRAINT mat_tx_load_index_expense_only
  CHECK (load_index IS NULL OR type = 'expense'::transaction_type);

-- ── Справочник контрагентов ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS counterparties (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);
CREATE INDEX IF NOT EXISTS idx_counterparties_company ON counterparties(company_id);

-- ── material_transactions.counterparty_id (текстовый counterparty оставляем) ─
ALTER TABLE material_transactions
  ADD COLUMN IF NOT EXISTS counterparty_id uuid REFERENCES counterparties(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_mat_tx_counterparty_id ON material_transactions(counterparty_id);

COMMENT ON COLUMN material_transactions.counterparty_id IS
  'Контрагент отгрузки из справочника counterparties. Текстовый counterparty оставлен для истории.';

-- ── Прайс: контрагент × базовая марка × индекс нагрузки → цена/шт ─────────
CREATE TABLE IF NOT EXISTS price_list (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid          NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  material_id     uuid          NOT NULL REFERENCES materials(id) ON DELETE CASCADE,  -- базовая марка
  load_index      text          NOT NULL,
  counterparty_id uuid          NOT NULL REFERENCES counterparties(id) ON DELETE CASCADE,
  price           numeric(14,2) NOT NULL CHECK (price >= 0),
  created_at      timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (company_id, material_id, load_index, counterparty_id)
);
CREATE INDEX IF NOT EXISTS idx_price_list_company  ON price_list(company_id);
CREATE INDEX IF NOT EXISTS idx_price_list_material ON price_list(material_id);

-- ── RLS (зеркалит политику materials) ────────────────────────────────────
ALTER TABLE counterparties ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_list     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cp: members select"        ON counterparties;
DROP POLICY IF EXISTS "cp: admin/manager write"   ON counterparties;
DROP POLICY IF EXISTS "cp: admin/manager update"  ON counterparties;
DROP POLICY IF EXISTS "cp: admin delete"          ON counterparties;
CREATE POLICY "cp: members select" ON counterparties FOR SELECT
  USING (company_id = private.get_my_company_id());
CREATE POLICY "cp: admin/manager write" ON counterparties FOR INSERT
  WITH CHECK (company_id = private.get_my_company_id()
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager')));
CREATE POLICY "cp: admin/manager update" ON counterparties FOR UPDATE
  USING (company_id = private.get_my_company_id()
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager')));
CREATE POLICY "cp: admin delete" ON counterparties FOR DELETE
  USING (company_id = private.get_my_company_id()
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "price: members select"       ON price_list;
DROP POLICY IF EXISTS "price: admin/manager write"  ON price_list;
DROP POLICY IF EXISTS "price: admin/manager update" ON price_list;
DROP POLICY IF EXISTS "price: admin delete"         ON price_list;
CREATE POLICY "price: members select" ON price_list FOR SELECT
  USING (company_id = private.get_my_company_id());
CREATE POLICY "price: admin/manager write" ON price_list FOR INSERT
  WITH CHECK (company_id = private.get_my_company_id()
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager')));
CREATE POLICY "price: admin/manager update" ON price_list FOR UPDATE
  USING (company_id = private.get_my_company_id()
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','manager')));
CREATE POLICY "price: admin delete" ON price_list FOR DELETE
  USING (company_id = private.get_my_company_id()
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Контрольное число (не меняется — фаза аддитивная): ожидаем 2074.
DO $$
DECLARE v numeric;
BEGIN
  SELECT COALESCE(SUM(CASE WHEN mt.type IN ('income','return') THEN mt.quantity ELSE -mt.quantity END),0)
    INTO v FROM material_transactions mt JOIN materials m ON m.id = mt.material_id
   WHERE m.company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e'
     AND mt.deleted_at IS NULL AND m.name NOT IN ('Бетон','Арматура','Проволока');
  RAISE NOTICE 'Остаток продукции (должно быть 2074): %', v;
END $$;

COMMIT;
