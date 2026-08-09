-- ============================================================
-- AD Pulse — production RPC: SOFT stock guard (defense-in-depth)
-- ============================================================
-- Supersedes the unapplied hard-block migration 039. The cart on /produce is
-- soft by design: a выпуск that pushes a raw material below zero still records
-- (flagged «спишет в минус»); only a raw that is ALREADY ≤ 0 blocks that one
-- position. This migration mirrors that rule on the server so the invariant
-- holds no matter the entry point (cart, Движение modal, direct RPC):
--
--   • raw balance > 0  → record, even if the result goes negative (soft)
--   • raw balance ≤ 0  → RAISE (nothing to consume) — caller holds that item
--
-- Built on the CURRENT live function (migration 028): rebar_material_name is
-- honoured, deterministic Бетон/rebar lookup kept. Idempotent CREATE OR REPLACE.
-- DO NOT apply 039 — apply THIS instead. Apply manually in Supabase SQL Editor.

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
  v_concrete_have       numeric;
  v_rebar_have          numeric;
  v_note                text;
BEGIN
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Компания не найдена';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Количество должно быть больше нуля';
  END IF;

  SELECT norm_concrete, norm_rebar, name, COALESCE(NULLIF(rebar_material_name, ''), 'Арматура')
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

  -- Current balances (non-deleted): income/return add, expense/defect subtract.
  SELECT COALESCE(SUM(CASE WHEN type IN ('income', 'return') THEN quantity ELSE -quantity END), 0)
    INTO v_concrete_have
    FROM material_transactions
   WHERE company_id = v_company_id AND material_id = v_concrete_id AND deleted_at IS NULL;

  SELECT COALESCE(SUM(CASE WHEN type IN ('income', 'return') THEN quantity ELSE -quantity END), 0)
    INTO v_rebar_have
    FROM material_transactions
   WHERE company_id = v_company_id AND material_id = v_rebar_id AND deleted_at IS NULL;

  -- SOFT guard: block ONLY when a required raw is already depleted (≤ 0).
  -- Going negative from a positive balance is allowed (client warns).
  IF v_concrete_have <= 0 THEN
    RAISE EXCEPTION 'Нет остатка бетона — сначала оформите приход';
  END IF;
  IF v_rebar_have <= 0 THEN
    RAISE EXCEPTION 'Нет остатка: % — сначала оформите приход', lower(v_rebar_material_name);
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
