-- ============================================================
-- ДИАГНОСТИКА РАСХОЖДЕНИЯ СХЕМЫ — ОДНИМ ЗАПРОСОМ
-- ============================================================
-- ТОЛЬКО ЧТЕНИЕ. Один SELECT → один результат. Разверни ячейку и скопируй.
-- (Прошлая версия была из 7 запросов, а SQL Editor показывает только последний.)

SELECT jsonb_pretty(jsonb_build_object(

  'mt_columns', (
    SELECT jsonb_object_agg(column_name, data_type)
      FROM information_schema.columns
     WHERE table_schema='public' AND table_name='material_transactions'
       AND column_name IN ('load_index','counterparty_id','unit_price','counterparty')),

  'counterparties_columns', (
    SELECT jsonb_object_agg(column_name, data_type || CASE WHEN is_nullable='NO' THEN ' NOT NULL' ELSE '' END)
      FROM information_schema.columns
     WHERE table_schema='public' AND table_name='counterparties'),

  'price_list_columns', (
    SELECT jsonb_object_agg(column_name, data_type || CASE WHEN is_nullable='NO' THEN ' NOT NULL' ELSE '' END)
      FROM information_schema.columns
     WHERE table_schema='public' AND table_name='price_list'),

  'policies', (
    SELECT jsonb_agg(tablename || ' :: ' || policyname ORDER BY tablename, policyname)
      FROM pg_policies
     WHERE schemaname='public' AND tablename IN ('counterparties','price_list')),

  'check_constraints', (
    SELECT jsonb_agg(conname ORDER BY conname)
      FROM pg_constraint
     WHERE conrelid='public.material_transactions'::regclass AND contype='c'),

  'counts', jsonb_build_object(
    'counterparties_rows',  (SELECT count(*) FROM counterparties),
    'price_list_rows',      (SELECT count(*) FROM price_list),
    'tx_s_load_index',      (SELECT count(*) FROM material_transactions WHERE load_index IS NOT NULL),
    'tx_s_counterparty_id', (SELECT count(*) FROM material_transactions WHERE counterparty_id IS NOT NULL),
    'tx_s_cenoj',           (SELECT count(*) FROM material_transactions WHERE unit_price IS NOT NULL)),

  -- ── Остаток и из чего он складывается ────────────────────────────────
  'ostatok_vsego', (
    SELECT COALESCE(SUM(CASE WHEN mt.type IN ('income','return') THEN mt.quantity ELSE -mt.quantity END),0)
      FROM material_transactions mt JOIN materials m ON m.id = mt.material_id
     WHERE m.company_id='ab426af3-ba63-4137-b7c6-368b425f934e'
       AND mt.deleted_at IS NULL AND m.name NOT IN ('Бетон','Арматура','Проволока')),

  -- Кто даёт дробный остаток: у перемычек (шт) его быть не должно.
  -- Скорее всего в номенклатуру добавили сырьё с именем, которого нет
  -- в списке-исключении — тогда контрольное число считается неверно.
  'drobnye_ostatki', (
    SELECT jsonb_object_agg(name, balance) FROM (
      SELECT m.name,
             COALESCE(SUM(CASE WHEN mt.type IN ('income','return') THEN mt.quantity ELSE -mt.quantity END),0) AS balance
        FROM materials m LEFT JOIN material_transactions mt
          ON mt.material_id=m.id AND mt.deleted_at IS NULL
       WHERE m.company_id='ab426af3-ba63-4137-b7c6-368b425f934e'
         AND m.name NOT IN ('Бетон','Арматура','Проволока')
       GROUP BY m.name
      HAVING COALESCE(SUM(CASE WHEN mt.type IN ('income','return') THEN mt.quantity ELSE -mt.quantity END),0) <> 0
         AND COALESCE(SUM(CASE WHEN mt.type IN ('income','return') THEN mt.quantity ELSE -mt.quantity END),0)
             <> trunc(COALESCE(SUM(CASE WHEN mt.type IN ('income','return') THEN mt.quantity ELSE -mt.quantity END),0))
    ) q),

  -- Материалы, появившиеся в номенклатуре (вдруг добавили новое сырьё)
  'vsego_materialov', (
    SELECT count(*) FROM materials WHERE company_id='ab426af3-ba63-4137-b7c6-368b425f934e'),
  'materialov_s_indeksom', (
    SELECT count(*) FROM materials
     WHERE company_id='ab426af3-ba63-4137-b7c6-368b425f934e' AND name ~ '^\dПБ[0-9]+-[0-9]+'),

  -- ── БЛОКЕР из предполётной проверки: планы на индекс-позициях ────────
  'plan_rows_na_indeks_poziciyah', (
    SELECT count(*) FROM plan_materials pm JOIN materials m ON m.id=pm.material_id
     WHERE m.company_id='ab426af3-ba63-4137-b7c6-368b425f934e'
       AND m.name ~ '^\dПБ[0-9]+-[0-9]+'),

  -- ── Контрагенты в истории ────────────────────────────────────────────
  'kontragenty', (
    SELECT jsonb_object_agg(counterparty, n) FROM (
      SELECT counterparty, count(*) AS n FROM material_transactions
       WHERE company_id='ab426af3-ba63-4137-b7c6-368b425f934e'
         AND counterparty IS NOT NULL AND deleted_at IS NULL
       GROUP BY counterparty) c)

)) AS diag;
