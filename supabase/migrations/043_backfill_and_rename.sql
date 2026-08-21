-- ============================================================
-- AD Pulse — Фазы 2+3: backfill load_index + СЛИЯНИЕ индекс-вариантов в базу
-- ============================================================
-- ПОДГОТОВЛЕНО, НЕ ПРИМЕНЕНО. Применять ВТОРОЙ (после 042). Критично.
--
-- ⚠️ ПЕРЕСМОТРЕНО против первоначального плана: живые данные изменились —
-- клиент писал выпуск И отгрузки на РАЗНЫХ индекс-вариантах одной базы
-- (3ПБ18-8 и 3ПБ18-37, 5ПБ25-27 и 5ПБ25-37, …). Значит это не чистое
-- переименование, а СЛИЯНИЕ историй в одну базовую марку. Логика data-driven
-- (по regexp из имени), НЕ хардкод — устойчива к дальнейшему дрейфу данных.
--
-- ⚠️ РЕШЕНИЕ ПО «-п» (петли): здесь «-п» СНИМАЕТСЯ вместе с индексом (base =
-- серия+длина), т.е. 3ПБ18-37-п сливается в 3ПБ18. Причина: у «-п» позиций
-- 0 выпуска и только отгрузки → отрицательный сток, что для отдельного изделия
-- бессмысленно (значит «-п» — тоже пометка отгрузки). ЕСЛИ мастер скажет, что
-- «-п» — физически отдельное изделие → заменить regexp на '-[0-9]+$' (снимать
-- только индекс, «-п» оставлять). ПОДТВЕРДИТЬ до применения.
--
-- Всё в одной транзакции со сверкой before==after (без хардкода числа): при
-- любом расхождении остатка продукции — RAISE EXCEPTION → откат.

BEGIN;

DO $$
DECLARE
  SATTY constant uuid := 'ab426af3-ba63-4137-b7c6-368b425f934e';
  v_before numeric; v_after numeric; v_moved bigint;
BEGIN
  SELECT COALESCE(SUM(CASE WHEN mt.type IN ('income','return') THEN mt.quantity ELSE -mt.quantity END),0)
    INTO v_before FROM material_transactions mt JOIN materials m ON m.id = mt.material_id
   WHERE m.company_id = SATTY AND mt.deleted_at IS NULL AND m.name NOT IN ('Бетон','Арматура','Проволока');

  -- ── Фаза 2: load_index на ВСЕХ отгрузках индекс-позиций (индекс из имени) ──
  UPDATE material_transactions mt
     SET load_index = substring(m.name from '^\dПБ[0-9]+-([0-9]+)')
    FROM materials m
   WHERE mt.material_id = m.id
     AND m.company_id = SATTY
     AND mt.type = 'expense'
     AND mt.load_index IS NULL
     AND m.name ~ '^\dПБ[0-9]+-[0-9]+';

  -- ── Фаза 3a: СЛИЯНИЕ — перенос всех транзакций на канонический материал базы.
  -- base = имя без "-<индекс>" и без "-п" (см. РЕШЕНИЕ выше).
  -- Канонический = позиция с наибольшим выпуском (детерм. tiebreak по имени).
  WITH bm AS (
    SELECT id, name, regexp_replace(name, '-[0-9]+(-п)?$', '') AS base
      FROM materials WHERE company_id = SATTY AND name ~ '^\dПБ[0-9]+-[0-9]+'
  ),
  inc AS (
    SELECT material_id, COALESCE(SUM(quantity) FILTER (WHERE type = 'income'), 0) AS q
      FROM material_transactions WHERE company_id = SATTY AND deleted_at IS NULL GROUP BY material_id
  ),
  canon AS (
    SELECT DISTINCT ON (base) base, bm.id AS cid
      FROM bm LEFT JOIN inc ON inc.material_id = bm.id
     ORDER BY base, COALESCE(inc.q,0) DESC, bm.name
  )
  UPDATE material_transactions mt SET material_id = c.cid
    FROM bm JOIN canon c ON c.base = bm.base
   WHERE mt.material_id = bm.id AND bm.id <> c.cid;
  GET DIAGNOSTICS v_moved = ROW_COUNT;

  -- ── Фаза 3b: переименование канонических позиций в базовую марку ──────────
  WITH bm AS (
    SELECT id, name, regexp_replace(name, '-[0-9]+(-п)?$', '') AS base
      FROM materials WHERE company_id = SATTY AND name ~ '^\dПБ[0-9]+-[0-9]+'
  ),
  inc AS (
    SELECT material_id, COALESCE(SUM(quantity) FILTER (WHERE type = 'income'), 0) AS q
      FROM material_transactions WHERE company_id = SATTY AND deleted_at IS NULL GROUP BY material_id
  ),
  canon AS (
    SELECT DISTINCT ON (base) base, bm.id AS cid
      FROM bm LEFT JOIN inc ON inc.material_id = bm.id
     ORDER BY base, COALESCE(inc.q,0) DESC, bm.name
  )
  UPDATE materials m SET name = c.base FROM canon c WHERE m.id = c.cid;

  SELECT COALESCE(SUM(CASE WHEN mt.type IN ('income','return') THEN mt.quantity ELSE -mt.quantity END),0)
    INTO v_after FROM material_transactions mt JOIN materials m ON m.id = mt.material_id
   WHERE m.company_id = SATTY AND mt.deleted_at IS NULL AND m.name NOT IN ('Бетон','Арматура','Проволока');

  IF v_before <> v_after THEN
    RAISE EXCEPTION 'РАСХОЖДЕНИЕ ОСТАТКА: было %, стало % — откат', v_before, v_after;
  END IF;
  RAISE NOTICE 'OK. Перенесено транзакций: %. Остаток продукции сохранён: % шт.', v_moved, v_after;
END $$;

-- ── Контрольные числа по базам (сверить глазами; хардкода нет — актуальные) ─
SELECT m.name AS base,
       COALESCE(SUM(CASE WHEN mt.type IN ('income','return') THEN mt.quantity ELSE -mt.quantity END),0) AS balance
  FROM materials m
  LEFT JOIN material_transactions mt ON mt.material_id = m.id AND mt.deleted_at IS NULL
 WHERE m.company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e'
   AND m.name NOT IN ('Бетон','Арматура','Проволока')
   AND m.name !~ '-'
 GROUP BY m.name
 ORDER BY m.name;

COMMIT;
