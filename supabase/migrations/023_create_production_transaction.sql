-- ============================================================
-- AD Pulse — atomic "production" transaction
-- ============================================================
-- Creating one unit of finished product (перемычка) consumes concrete and
-- rebar according to the product's own norm_concrete/norm_rebar. This
-- function creates all three transactions (income of the product, expense
-- of concrete, expense of rebar) in a single statement-level transaction so
-- they either all succeed or all fail together.
--
-- SECURITY INVOKER (default) on purpose — company_id and auth.uid() are
-- derived inside the function rather than trusted as parameters, so the
-- existing RLS policies on materials/material_transactions still apply to
-- every read and write here exactly as if the caller had run them directly.

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
  v_company_id    uuid := private.get_my_company_id();
  v_norm_concrete numeric;
  v_norm_rebar    numeric;
  v_product_name  text;
  v_concrete_id   uuid;
  v_rebar_id      uuid;
  v_note          text;
BEGIN
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Компания не найдена';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Количество должно быть больше нуля';
  END IF;

  SELECT norm_concrete, norm_rebar, name
    INTO v_norm_concrete, v_norm_rebar, v_product_name
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
   LIMIT 1;

  SELECT id INTO v_rebar_id
    FROM materials
   WHERE company_id = v_company_id AND name = 'Арматура'
   LIMIT 1;

  IF v_concrete_id IS NULL THEN
    RAISE EXCEPTION 'Материал "Бетон" не найден в справочнике компании';
  END IF;
  IF v_rebar_id IS NULL THEN
    RAISE EXCEPTION 'Материал "Арматура" не найден в справочнике компании';
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
