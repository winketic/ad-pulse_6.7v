-- ============================================================
-- AD Pulse — материал-заменитель арматуры (Проволока) + СаттиГрупп:
-- -п варианты ГОСТ 948-84 для уже существующих позиций
-- ============================================================
-- company_id = ab426af3-ba63-4137-b7c6-368b425f934e
--
-- Часть A: новая колонка materials.rebar_material_name — какой материал
-- списывать как "металл на штуку" вместо хардкода 'Арматура'. Для лёгких
-- коротких перемычек (1ПБ серия) используется Проволока, не Арматура.
--
-- Часть B: create_production_transaction теперь ищет металл по
-- materials.rebar_material_name продукта вместо хардкода 'Арматура'.
--
-- Часть C: материал "Проволока" (кг) + все ещё не залитые позиции ГОСТ
-- 948-84 для СаттиГрупп — 1ПБ (металл = Проволока), плюс -п варианты
-- для уже существующих 2ПБ-10/13/16/17/22, 3ПБ-13/16/18/21/25/27/30,
-- 5ПБ-18/21. Всё через WHERE NOT EXISTS — безопасно применять независимо
-- от того, накатывалась ли ранее миграция 027.

-- ─── Часть A: новая колонка ──────────────────────────────────

ALTER TABLE materials ADD COLUMN IF NOT EXISTS rebar_material_name text NOT NULL DEFAULT 'Арматура';

COMMENT ON COLUMN materials.rebar_material_name IS
  'Имя материала, который списывается как "металл на штуку" при производстве (Арматура или Проволока)';

-- ─── Часть B: функция ────────────────────────────────────────

CREATE OR REPLACE FUNCTION create_production_transaction(
  p_product_material_id uuid,
  p_quantity numeric,
  p_transaction_date date
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_company_id          uuid := private.get_my_company_id();
  v_norm_concrete       numeric;
  v_norm_rebar          numeric;
  v_product_name        text;
  v_rebar_material_name text;
  v_concrete_id         uuid;
  v_rebar_id            uuid;
  v_note                text;
BEGIN
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Компания не найдена';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Количество должно быть больше нуля';
  END IF;

  SELECT norm_concrete, norm_rebar, name, rebar_material_name
    INTO v_norm_concrete, v_norm_rebar, v_product_name, v_rebar_material_name
    FROM materials
   WHERE id = p_product_material_id
     AND company_id = v_company_id;

  IF v_product_name IS NULL THEN
    RAISE EXCEPTION 'Материал не найден';
  END IF;

  IF v_norm_concrete IS NULL OR v_norm_rebar IS NULL THEN
    RAISE EXCEPTION 'Нормы расхода не заданы для этого материала';
  END IF;

  SELECT id INTO v_concrete_id
    FROM materials
   WHERE company_id = v_company_id AND name = 'Бетон'
   ORDER BY created_at ASC
   LIMIT 1;

  SELECT id INTO v_rebar_id
    FROM materials
   WHERE company_id = v_company_id AND name = v_rebar_material_name
   ORDER BY created_at ASC
   LIMIT 1;

  IF v_concrete_id IS NULL THEN
    RAISE EXCEPTION 'Материал "Бетон" не найден в справочнике компании';
  END IF;
  IF v_rebar_id IS NULL THEN
    RAISE EXCEPTION 'Материал "%" не найден в справочнике компании', v_rebar_material_name;
  END IF;

  v_note := 'Производство: ' || v_product_name || ' ' || p_quantity || ' шт';

  INSERT INTO material_transactions
    (company_id, material_id, type, quantity, note, transaction_date, created_by, source)
  VALUES
    (v_company_id, p_product_material_id, 'income', p_quantity, v_note, p_transaction_date, auth.uid(), 'manual');

  INSERT INTO material_transactions
    (company_id, material_id, type, quantity, note, transaction_date, created_by, source)
  VALUES
    (v_company_id, v_concrete_id, 'expense', p_quantity * v_norm_concrete, v_note, p_transaction_date, auth.uid(), 'manual');

  INSERT INTO material_transactions
    (company_id, material_id, type, quantity, note, transaction_date, created_by, source)
  VALUES
    (v_company_id, v_rebar_id, 'expense', p_quantity * v_norm_rebar, v_note, p_transaction_date, auth.uid(), 'manual');
END;
$$;

-- ─── Часть C: данные СаттиГрупп ──────────────────────────────

-- Проволока (заменитель арматуры для лёгких 1ПБ)
INSERT INTO materials (company_id, name, unit)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', 'Проволока', 'кг'
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = 'Проволока');

-- 1ПБ (металл = Проволока)
INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar, rebar_material_name)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '1ПБ-10', 'шт', 0.008, 0.31, 'Проволока'
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '1ПБ-10');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar, rebar_material_name)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '1ПБ-13', 'шт', 0.010, 0.41, 'Проволока'
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '1ПБ-13');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar, rebar_material_name)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '1ПБ-16', 'шт', 0.012, 0.48, 'Проволока'
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '1ПБ-16');

-- На случай если 1ПБ-10/13/16 уже были залиты раньше (например миграцией
-- 027, где колонки rebar_material_name ещё не существовало) — гарантируем
-- правильное значение независимо от пути вставки.
UPDATE materials
   SET rebar_material_name = 'Проволока'
 WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e'
   AND name IN ('1ПБ-10', '1ПБ-13', '1ПБ-16');

-- 2ПБ
INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '2ПБ-19', 'шт', 0.033, 0.85
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '2ПБ-19');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '2ПБ-19-п', 'шт', 0.033, 1.11
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '2ПБ-19-п');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '2ПБ-25', 'шт', 0.041, 1.85
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '2ПБ-25');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '2ПБ-25-п', 'шт', 0.041, 2.11
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '2ПБ-25-п');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '2ПБ-26', 'шт', 0.044, 2.40
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '2ПБ-26');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '2ПБ-26-п', 'шт', 0.044, 2.66
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '2ПБ-26-п');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '2ПБ-29', 'шт', 0.048, 3.06
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '2ПБ-29');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '2ПБ-29-п', 'шт', 0.048, 3.32
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '2ПБ-29-п');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '2ПБ-30', 'шт', 0.050, 3.19
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '2ПБ-30');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '2ПБ-30-п', 'шт', 0.050, 3.45
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '2ПБ-30-п');

-- 2ПБ -п для уже существующих базовых позиций
INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '2ПБ-10-п', 'шт', 0.017, 0.50
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '2ПБ-10-п');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '2ПБ-13-п', 'шт', 0.022, 0.57
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '2ПБ-13-п');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '2ПБ-16-п', 'шт', 0.026, 0.79
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '2ПБ-16-п');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '2ПБ-17-п', 'шт', 0.028, 0.83
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '2ПБ-17-п');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '2ПБ-22-п', 'шт', 0.037, 1.44
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '2ПБ-22-п');

-- 3ПБ
INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '3ПБ-34', 'шт', 0.089, 2.73
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '3ПБ-34');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '3ПБ-34-п', 'шт', 0.089, 3.31
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '3ПБ-34-п');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '3ПБ-36', 'шт', 0.096, 4.10
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '3ПБ-36');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '3ПБ-36-п', 'шт', 0.096, 4.68
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '3ПБ-36-п');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '3ПБ-39', 'шт', 0.103, 10.13
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '3ПБ-39');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '3ПБ-39-п', 'шт', 0.103, 10.71
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '3ПБ-39-п');

-- 3ПБ -п для уже существующих базовых позиций
INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '3ПБ-13-п', 'шт', 0.034, 2.06
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '3ПБ-13-п');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '3ПБ-16-п', 'шт', 0.041, 3.26
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '3ПБ-16-п');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '3ПБ-18-п', 'шт', 0.048, 1.50
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '3ПБ-18-п');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '3ПБ-21-п', 'шт', 0.055, 1.73
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '3ПБ-21-п');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '3ПБ-25-п', 'шт', 0.065, 2.42
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '3ПБ-25-п');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '3ПБ-27-п', 'шт', 0.072, 3.54
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '3ПБ-27-п');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '3ПБ-30-п', 'шт', 0.079, 3.86
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '3ПБ-30-п');

-- 4ПБ
INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '4ПБ-30', 'шт', 0.104, 1.85
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '4ПБ-30');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '4ПБ-30-п', 'шт', 0.104, 2.49
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '4ПБ-30-п');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '4ПБ-44', 'шт', 0.154, 11.88
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '4ПБ-44');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '4ПБ-44-п', 'шт', 0.154, 12.52
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '4ПБ-44-п');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '4ПБ-48', 'шт', 0.167, 15.12
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '4ПБ-48');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '4ПБ-48-п', 'шт', 0.167, 15.76
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '4ПБ-48-п');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '4ПБ-60', 'шт', 0.207, 29.20
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '4ПБ-60');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '4ПБ-60-п', 'шт', 0.207, 29.84
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '4ПБ-60-п');

-- 5ПБ (базовые 5ПБ-25 и 5ПБ-27 уже есть в базе)
INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '5ПБ-25-п', 'шт', 0.135, 9.06
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '5ПБ-25-п');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '5ПБ-27-п', 'шт', 0.150, 12.49
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '5ПБ-27-п');

-- 5ПБ -п для уже существующих базовых позиций 5ПБ-18 / 5ПБ-21
INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '5ПБ-18-п', 'шт', 0.100, 4.34
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '5ПБ-18-п');

INSERT INTO materials (company_id, name, unit, norm_concrete, norm_rebar)
SELECT 'ab426af3-ba63-4137-b7c6-368b425f934e', '5ПБ-21-п', 'шт', 0.114, 6.06
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE company_id = 'ab426af3-ba63-4137-b7c6-368b425f934e' AND name = '5ПБ-21-п');
