-- 053_create_production_plan_rpc.sql
-- ============================================================
-- AD Pulse — атомарное создание производственного плана (053)
-- ============================================================
-- Дефект: createPlan (app/(dashboard)/dashboard/plans/actions.ts) вставлял
-- production_plans, затем ОТДЕЛЬНЫМ запросом plan_materials. Если вторая
-- вставка падала, первый INSERT оставался в базе: активный план без
-- материалов, уведомление уже разослано, пользователь видит ошибку.
-- Ретрай создавал второй план-сироту.
--
-- Здесь то же создание выполняется одной функцией: тело функции —
-- одна транзакция, поэтому любое исключение (в т.ч. нарушение RLS,
-- FK или CHECK при вставке материалов) откатывает и план, и материалы.
-- Никакого «частично созданного» плана существовать не может.
--
-- Семантика и проверки не ослаблены, а перенесены на границу данных:
--   * p_company_id обязан принадлежать auth.uid() (profiles);
--   * p_created_by обязан совпадать с auth.uid() (авторство нельзя подменить)
--     и быть профилем этой компании;
--   * p_assigned_to должен быть профилем этой компании;
--   * p_status — одно из значений enum public.plan_status;
--   * p_materials — непустой JSON-массив объектов
--     {material_id: uuid, planned_quantity: number > 0} без дублей;
--   * все material_id обязаны существовать и принадлежать p_company_id;
--   * planned_quantity плана = сумма planned_quantity материалов.
--
-- SECURITY INVOKER: функция работает от имени вызывающего пользователя,
-- поэтому RLS на production_plans/plan_materials (048/049) остаётся
-- включённой и продолжает действовать — плюс собственные проверки выше.
--
-- Права: EXECUTE только authenticated (серверный клиент с cookie-сессией
-- пользователя). PUBLIC и anon не должны видеть функцию.
--
-- Применять ВРУЧНУЮ в Supabase SQL Editor. До применения код actions.ts
-- работает по старой двухшаговой схеме с компенсирующим удалением
-- (ошибка PostgREST PGRST202 / PostgreSQL 42883 = функции ещё нет).

BEGIN;

CREATE OR REPLACE FUNCTION public.create_production_plan_with_materials(
  p_company_id  uuid,
  p_name        text,
  p_start_date  date,
  p_end_date    date,
  p_status      text,
  p_created_by  uuid,
  p_assigned_to uuid,
  p_materials   jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_plan_id            uuid;
  v_material_rows      integer;
  v_distinct_materials integer;
  v_owned_materials    integer;
  v_planned_quantity   numeric;
BEGIN
  -- ── 1. Арендатор: компания должна принадлежать текущему пользователю ──
  IF NOT EXISTS (
    SELECT 1
      FROM public.profiles AS pr
     WHERE pr.id = auth.uid()
       AND pr.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Компания % не принадлежит текущему пользователю', p_company_id
      USING ERRCODE = '42501';
  END IF;

  -- ── 2. Простые поля плана ────────────────────────────────────────────
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'Укажите название плана' USING ERRCODE = '22023';
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'Укажите период плана' USING ERRCODE = '22023';
  END IF;

  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'Дата окончания не может быть раньше даты начала'
      USING ERRCODE = '22023';
  END IF;

  IF p_status IS NULL OR p_status NOT IN ('active', 'completed', 'cancelled') THEN
    RAISE EXCEPTION 'Неизвестный статус плана: %', p_status
      USING ERRCODE = '22023';
  END IF;

  -- ── 2.1. Автор — только сам вызывающий пользователь ──────────────────
  -- p_created_by приходит от клиента, а функция выдана роли authenticated,
  -- поэтому её можно вызвать напрямую через PostgREST в обход actions.ts.
  -- Проверки «профиль существует в этой компании» недостаточно: с ней
  -- пользователь мог бы записать автором коллегу из той же компании и
  -- подменить авторство. Автор всегда равен auth.uid().
  IF p_created_by IS NULL OR p_created_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Автором плана может быть только текущий пользователь'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.profiles AS author
     WHERE author.id = p_created_by
       AND author.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Автор плана не найден в вашей компании'
      USING ERRCODE = '42501';
  END IF;

  -- assigned_to приходит от клиента: FK проверяет только существование
  -- профиля, но не его компанию. Держим план в границах арендатора.
  IF p_assigned_to IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM public.profiles AS assignee
     WHERE assignee.id = p_assigned_to
       AND assignee.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Исполнитель не найден в вашей компании'
      USING ERRCODE = '42501';
  END IF;

  -- ── 3. Состав материалов: форма JSON ─────────────────────────────────
  IF p_materials IS NULL OR pg_catalog.jsonb_typeof(p_materials) <> 'array' THEN
    RAISE EXCEPTION 'Материалы плана должны быть JSON-массивом'
      USING ERRCODE = '22023';
  END IF;

  IF pg_catalog.jsonb_array_length(p_materials) = 0 THEN
    RAISE EXCEPTION 'Добавьте хотя бы один материал' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_catalog.jsonb_array_elements(p_materials) AS e(elem)
     WHERE pg_catalog.jsonb_typeof(e.elem) IS DISTINCT FROM 'object'
        OR pg_catalog.jsonb_typeof(e.elem -> 'material_id') IS DISTINCT FROM 'string'
        OR pg_catalog.jsonb_typeof(e.elem -> 'planned_quantity') IS DISTINCT FROM 'number'
  ) THEN
    RAISE EXCEPTION 'Каждый материал должен содержать material_id и planned_quantity'
      USING ERRCODE = '22023';
  END IF;

  -- ── 4. Разбор состава (ошибки типов не оставляют мусора) ─────────────
  BEGIN
    SELECT count(*)::integer,
           count(DISTINCT (e.elem ->> 'material_id')::uuid)::integer,
           COALESCE(sum((e.elem ->> 'planned_quantity')::numeric), 0)
      INTO v_material_rows, v_distinct_materials, v_planned_quantity
      FROM pg_catalog.jsonb_array_elements(p_materials) AS e(elem);
  EXCEPTION
    WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'Некорректный состав материалов плана'
        USING ERRCODE = '22023';
  END;

  IF v_material_rows <> v_distinct_materials THEN
    RAISE EXCEPTION 'Один и тот же материал указан несколько раз'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_catalog.jsonb_array_elements(p_materials) AS e(elem)
     WHERE (e.elem ->> 'planned_quantity')::numeric <= 0
  ) THEN
    RAISE EXCEPTION 'Количество материала должно быть больше нуля'
      USING ERRCODE = '22023';
  END IF;

  -- ── 5. Все материалы существуют и принадлежат этой компании ──────────
  SELECT count(*)::integer
    INTO v_owned_materials
    FROM public.materials AS m
   WHERE m.company_id = p_company_id
     AND m.id IN (
       SELECT (e.elem ->> 'material_id')::uuid
         FROM pg_catalog.jsonb_array_elements(p_materials) AS e(elem)
     );

  IF v_owned_materials <> v_distinct_materials THEN
    RAISE EXCEPTION 'Один или несколько материалов не найдены в вашей компании'
      USING ERRCODE = '42501';
  END IF;

  -- ── 6. План + материалы в одной транзакции ───────────────────────────
  INSERT INTO public.production_plans (
    company_id,
    name,
    planned_quantity,
    start_date,
    end_date,
    status,
    created_by,
    assigned_to
  )
  VALUES (
    p_company_id,
    btrim(p_name),
    v_planned_quantity,
    p_start_date,
    p_end_date,
    p_status::public.plan_status,
    p_created_by,
    p_assigned_to
  )
  RETURNING id INTO v_plan_id;

  INSERT INTO public.plan_materials (plan_id, material_id, planned_quantity)
  SELECT v_plan_id,
         (e.elem ->> 'material_id')::uuid,
         (e.elem ->> 'planned_quantity')::numeric
    FROM pg_catalog.jsonb_array_elements(p_materials) AS e(elem);

  RETURN v_plan_id;
END;
$$;

-- Идемпотентность применения: CREATE OR REPLACE сохраняет ACL, но REVOKE/
-- GRANT ниже выполняются всегда, поэтому повторный прогон безопасен.
REVOKE ALL ON FUNCTION public.create_production_plan_with_materials(uuid, text, date, date, text, uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_production_plan_with_materials(uuid, text, date, date, text, uuid, uuid, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.create_production_plan_with_materials(uuid, text, date, date, text, uuid, uuid, jsonb) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.create_production_plan_with_materials(uuid, text, date, date, text, uuid, uuid, jsonb) TO authenticated;

COMMIT;
