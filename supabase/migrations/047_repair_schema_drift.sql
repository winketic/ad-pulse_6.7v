-- ============================================================
-- AD Pulse — РЕМОНТ РАСХОЖДЕНИЯ СХЕМЫ
-- ============================================================
-- ⚠️ ПРИМЕНЯТЬ ПЕРВОЙ — до 043. Номер 047 только потому, что файл написан
-- позже; порядок выполнения: 047 → 043 → 044 → 045 → 046.
--
-- ПРИЧИНА. В базе прогнаны ДВА разных 042: сначала черновик ассистента
-- (писался вслепую, без доступа к репозиторию), затем репозиторный
-- 042_schema_load_index_and_refs.sql. Второй ничего не исправил, потому что
-- CREATE TABLE IF NOT EXISTS и ADD COLUMN IF NOT EXISTS на существующих
-- объектах — no-op. В итоге схема осталась черновичной:
--   material_transactions.load_index  integer   → должно быть text
--   price_list.load_index             integer   → должно быть text
--   price_list.unit_price                       → должно называться price
--   counterparties.name_normalized NOT NULL     → в репозиторной модели нет
--   плюс дублирующий комплект RLS-политик
-- Из-за типа integer и падала 043 (42804: column is of type integer but
-- expression is of type text).
--
-- БЕЗОПАСНОСТЬ. Проверено на живой базе 05.10.2026:
--   price_list                                    — 0 строк
--   material_transactions.load_index IS NOT NULL  — 0 строк
--   counterparties                                — 6 строк, из них
--     «Сенсата» имеет 131 привязанную транзакцию (её сохраняем)
-- Приведение типов и переименование на пустых данных ничего не теряют.
-- Транзакции (material_transactions) эта миграция не трогает вообще.

BEGIN;

-- ── 1) Снять дублирующие политики черновика ──────────────────────────────
-- Репозиторные («cp: …», «price: …») остаются и становятся единственными.
DROP POLICY IF EXISTS counterparties_select ON counterparties;
DROP POLICY IF EXISTS counterparties_write  ON counterparties;
DROP POLICY IF EXISTS price_list_select     ON price_list;
DROP POLICY IF EXISTS price_list_write      ON price_list;

-- ── 2) load_index: integer → text ────────────────────────────────────────
-- text, а не integer, потому что индекс нагрузки — это обозначение («8»,
-- «37»), а не число: над ним не считают, его сравнивают. На text завязаны
-- и репозиторный 045, и автоцена во фронте (Фаза 6).
-- CHECK mat_tx_load_index_expense_only от смены типа не страдает — он про
-- NULL и type, а не про значение.
ALTER TABLE material_transactions
  ALTER COLUMN load_index TYPE text USING load_index::text;

-- ── 3) price_list → репозиторная форма ───────────────────────────────────
ALTER TABLE price_list
  ALTER COLUMN load_index TYPE text USING load_index::text;

ALTER TABLE price_list RENAME COLUMN unit_price TO price;
-- CHECK сам начинает ссылаться на новое имя; переименовываем для порядка.
ALTER TABLE price_list RENAME CONSTRAINT price_list_unit_price_check TO price_list_price_check;

-- ── 4) counterparties → репозиторная форма ───────────────────────────────
-- name_normalized был изобретением черновика. Репозиторные 045/046 его не
-- заполняют, а он NOT NULL → любой их INSERT упал бы. UNIQUE висел на нём же,
-- поэтому сначала ставим UNIQUE на name (как в репозиторном 042), потом
-- убираем колонку вместе со старым ограничением.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.counterparties'::regclass
       AND contype = 'u'
       AND pg_get_constraintdef(oid) = 'UNIQUE (company_id, name)'
  ) THEN
    ALTER TABLE counterparties ADD CONSTRAINT counterparties_company_id_name_key
      UNIQUE (company_id, name);
  END IF;
END $$;

ALTER TABLE counterparties DROP COLUMN IF EXISTS name_normalized;

-- ── Контроль ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_mt_type text; v_pl_type text; v_price_col int; v_norm_col int; v_cp int; v_linked int;
BEGIN
  SELECT data_type INTO v_mt_type FROM information_schema.columns
   WHERE table_name='material_transactions' AND column_name='load_index';
  SELECT data_type INTO v_pl_type FROM information_schema.columns
   WHERE table_name='price_list' AND column_name='load_index';
  SELECT count(*) INTO v_price_col FROM information_schema.columns
   WHERE table_name='price_list' AND column_name='price';
  SELECT count(*) INTO v_norm_col FROM information_schema.columns
   WHERE table_name='counterparties' AND column_name='name_normalized';
  SELECT count(*) INTO v_cp FROM counterparties
   WHERE company_id='ab426af3-ba63-4137-b7c6-368b425f934e';
  SELECT count(*) INTO v_linked FROM material_transactions
   WHERE company_id='ab426af3-ba63-4137-b7c6-368b425f934e' AND counterparty_id IS NOT NULL;

  IF v_mt_type <> 'text'  THEN RAISE EXCEPTION 'load_index транзакций не text, а %', v_mt_type; END IF;
  IF v_pl_type <> 'text'  THEN RAISE EXCEPTION 'load_index прайса не text, а %', v_pl_type; END IF;
  IF v_price_col <> 1     THEN RAISE EXCEPTION 'в price_list нет колонки price'; END IF;
  IF v_norm_col  <> 0     THEN RAISE EXCEPTION 'name_normalized не удалён'; END IF;
  IF v_cp <> 6            THEN RAISE EXCEPTION 'контрагентов %, ожидалось 6 — данные затронуты', v_cp; END IF;
  IF v_linked < 131       THEN RAISE EXCEPTION 'привязок стало % (<131) — связи потеряны', v_linked; END IF;

  RAISE NOTICE 'Схема приведена к репозиторной. Контрагентов: %, привязок: %.', v_cp, v_linked;
END $$;

COMMIT;

-- После этого можно катить 043. Напоминание по порядку:
--   047 (этот) → 043 (слияние марок) → 044 (чистка опустевших позиций,
--   прогнать ПОВТОРНО: после слияния появятся новые пустые) → 045 → 046.
