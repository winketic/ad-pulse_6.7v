-- ============================================================
-- ПРЕДПОЛЁТНАЯ ПРОВЕРКА перед прогоном миграций 042–046
-- ============================================================
-- ТОЛЬКО ЧТЕНИЕ. Ничего не меняет. Выполнить в Supabase SQL Editor
-- и показать результат ассистенту ДО того, как катить 042.
--
-- Проверяет пять вещей:
--   1) что миграции действительно ещё не применены
--   2) текущее контрольное число остатка продукции
--   3) ⚠️ БЛОКЕР: ссылки из plan_materials на индекс-позиции
--      (043 их НЕ переносит, а FK стоит ON DELETE RESTRICT → 044 упадёт)
--   4) не будет ли конфликта UNIQUE(plan_id, material_id) при переносе
--   5) контрагентов в истории

-- ── 1) Применены ли миграции ────────────────────────────────────────────
SELECT
  to_regclass('public.counterparties') IS NOT NULL AS table_counterparties_exists,
  to_regclass('public.price_list')     IS NOT NULL AS table_price_list_exists,
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_name='material_transactions' AND column_name='load_index')      AS col_load_index_exists,
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_name='material_transactions' AND column_name='counterparty_id') AS col_counterparty_id_exists,
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_name='material_transactions' AND column_name='unit_price')      AS col_unit_price_exists;
-- Ожидаем: первые четыре false, unit_price true.
-- Если counterparties/price_list уже true — 042 кто-то накатил, скажи мне.

-- ── 2) Контрольное число: остаток продукции ─────────────────────────────
SELECT COALESCE(SUM(CASE WHEN mt.type IN ('income','return') THEN mt.quantity ELSE -mt.quantity END),0) AS ostatok_produkcii
  FROM material_transactions mt JOIN materials m ON m.id = mt.material_id
 WHERE m.company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e'
   AND mt.deleted_at IS NULL AND m.name NOT IN ('Бетон','Арматура','Проволока');
-- На 25.08.2026 было 1772. Это число НЕ должно измениться после 043 и 044.
-- Запиши его — оно понадобится для сверки.

-- ── 3) БЛОКЕР: планы, висящие на индекс-позициях ────────────────────────
-- 043 переносит на базовую марку только material_transactions. Если здесь
-- не ноль — plan_materials останется на старых позициях, и 044 упадёт на
-- FK (plan_materials.material_id ... ON DELETE RESTRICT).
SELECT count(*) AS plan_rows_na_indeks_poziciyah
  FROM plan_materials pm JOIN materials m ON m.id = pm.material_id
 WHERE m.company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e'
   AND m.name ~ '^\dПБ[0-9]+-[0-9]+';
-- 0 → проблема теоретическая, катим 043/044 как есть.
-- не 0 → СТОП, нужен патч к 043, покажи мне вывод следующего запроса.

-- Детали, если предыдущее не ноль
SELECT pp.id AS plan_id, pp.name AS plan_name, m.name AS material,
       regexp_replace(m.name, '-[0-9]+(-п)?$', '') AS base,
       pm.planned_quantity, pm.actual_quantity
  FROM plan_materials pm
  JOIN materials m ON m.id = pm.material_id
  JOIN production_plans pp ON pp.id = pm.plan_id
 WHERE m.company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e'
   AND m.name ~ '^\dПБ[0-9]+-[0-9]+'
 ORDER BY pp.id, m.name;

-- ── 4) Конфликт UNIQUE(plan_id, material_id) при переносе планов ────────
-- Если один план содержит две индекс-позиции одной базы (3ПБ18-8 и 3ПБ18-37),
-- при переносе на базу они столкнутся в UNIQUE. Надо решать: суммировать
-- или оставить отдельно.
SELECT pm.plan_id,
       regexp_replace(m.name, '-[0-9]+(-п)?$', '') AS base,
       count(*) AS pozicij_odnoj_bazy,
       string_agg(m.name, ', ' ORDER BY m.name) AS marki
  FROM plan_materials pm JOIN materials m ON m.id = pm.material_id
 WHERE m.company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e'
   AND m.name ~ '^\dПБ[0-9]+-[0-9]+'
 GROUP BY pm.plan_id, 2
HAVING count(*) > 1;
-- Пусто → конфликтов не будет.

-- ── 5) Контрагенты в истории (сверка со справочником из 045/046) ────────
SELECT counterparty, count(*) AS txns,
       count(*) FILTER (WHERE type='expense') AS otgruzok
  FROM material_transactions
 WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e'
   AND counterparty IS NOT NULL AND deleted_at IS NULL
 GROUP BY counterparty ORDER BY txns DESC;
-- Ожидаем: Sensata, Сенсата, Sapa trade inc, ARGP, Argp, СПК, Спк, Авангард.
-- Если появилось новое имя — его нет в 045/046, скажи мне, допишу.
