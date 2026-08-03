-- ============================================================
-- AD Pulse — production RPC: add stock guard (bug #1)
-- ============================================================
-- create_production_transaction deducted concrete/rebar with NO stock check,
-- so a выпуск could drive raw balances negative (reproduced: Бетон 94 → −1206).
-- Now each raw material's balance is computed first and the function RAISEs a
-- plain Russian error if the deduction would go below zero — nothing is written.
--
-- This is a full CREATE OR REPLACE based on the CURRENT live function (migration
-- 028), so the rebar_material_name resolution 028 already introduced is kept
-- verbatim — the reported "ignores rebar_material_name" bug was already fixed by
-- 028 and is preserved here; only the stock guard is new.
--
-- SECURITY INVOKER + get_my_company_id(): still scoped to the caller's company.
-- Idempotent (CREATE OR REPLACE). Balances count non-deleted rows only, with
-- income/return adding and expense/defect subtracting — same rule as the app.

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
  v_rebar_name    text;
  v_concrete_id   uuid;
  v_rebar_id      uuid;
  v_concrete_need numeric;
  v_rebar_need    numeric;
  v_concrete_have numeric;
  v_rebar_have    numeric;
  v_note          text;
BEGIN
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Компания не найдена';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Количество должно быть больше нуля';
  END IF;

  -- Product + its norms + which material stands in for "rebar".
  SELECT norm_concrete, norm_rebar, name, COALESCE(NULLIF(rebar_material_name, ''), 'Арматура')
    INTO v_norm_concrete, v_norm_rebar, v_product_name, v_rebar_name
    FROM materials
   WHERE id = p_product_material_id
     AND company_id = v_company_id;

  IF v_product_name IS NULL THEN
    RAISE EXCEPTION 'Материал не найден';
  END IF;

  IF v_norm_concrete IS NULL OR v_norm_rebar IS NULL THEN
    RAISE EXCEPTION 'Нормы расхода не заданы для этого материала';
  END IF;

  -- Deterministic lookup (oldest row wins) of Бетон and the rebar material.
  SELECT id INTO v_concrete_id
    FROM materials
   WHERE company_id = v_company_id AND name = 'Бетон'
   ORDER BY created_at ASC
   LIMIT 1;

  SELECT id INTO v_rebar_id
    FROM materials
   WHERE company_id = v_company_id AND name = v_rebar_name
   ORDER BY created_at ASC
   LIMIT 1;

  IF v_concrete_id IS NULL THEN
    RAISE EXCEPTION 'Материал "Бетон" не найден в справочнике компании';
  END IF;
  IF v_rebar_id IS NULL THEN
    RAISE EXCEPTION 'Материал "%" не найден в справочнике компании', v_rebar_name;
  END IF;

  v_concrete_need := p_quantity * v_norm_concrete;
  v_rebar_need    := p_quantity * v_norm_rebar;

  -- Current balances (non-deleted): income/return add, expense/defect subtract.
  SELECT COALESCE(SUM(CASE WHEN type IN ('income', 'return') THEN quantity ELSE -quantity END), 0)
    INTO v_concrete_have
    FROM material_transactions
   WHERE company_id = v_company_id AND material_id = v_concrete_id AND deleted_at IS NULL;

  SELECT COALESCE(SUM(CASE WHEN type IN ('income', 'return') THEN quantity ELSE -quantity END), 0)
    INTO v_rebar_have
    FROM material_transactions
   WHERE company_id = v_company_id AND material_id = v_rebar_id AND deleted_at IS NULL;

  -- Stock guard: production must not drive a raw material below zero.
  IF v_concrete_have - v_concrete_need < 0 THEN
    RAISE EXCEPTION 'Недостаточно бетона: нужно %, есть %',
      trim(trailing '0' from trim(trailing '.' from v_concrete_need::text)),
      trim(trailing '0' from trim(trailing '.' from v_concrete_have::text));
  END IF;
  IF v_rebar_have - v_rebar_need < 0 THEN
    RAISE EXCEPTION 'Недостаточно: % — нужно %, есть %',
      lower(v_rebar_name),
      trim(trailing '0' from trim(trailing '.' from v_rebar_need::text)),
      trim(trailing '0' from trim(trailing '.' from v_rebar_have::text));
  END IF;

  v_note := 'Производство: ' || v_product_name || ' ' || p_quantity || ' шт';

  INSERT INTO material_transactions
    (company_id, material_id, type, quantity, note, transaction_date, created_by, source)
  VALUES
    (v_company_id, p_product_material_id, 'income', p_quantity, v_note, p_transaction_date, auth.uid(), 'manual');

  INSERT INTO material_transactions
    (company_id, material_id, type, quantity, note, transaction_date, created_by, source)
  VALUES
    (v_company_id, v_concrete_id, 'expense', v_concrete_need, v_note, p_transaction_date, auth.uid(), 'manual');

  INSERT INTO material_transactions
    (company_id, material_id, type, quantity, note, transaction_date, created_by, source)
  VALUES
    (v_company_id, v_rebar_id, 'expense', v_rebar_need, v_note, p_transaction_date, auth.uid(), 'manual');
END;
$$;
