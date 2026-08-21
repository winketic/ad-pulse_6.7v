-- ============================================================
-- AD Pulse — Фаза 4: удаление пустых позиций (индекс/-п варианты, 0 транзакций)
-- ============================================================
-- ПОДГОТОВЛЕНО, НЕ ПРИМЕНЕНО. Применять ТРЕТЬЕЙ (после 043).
-- Удаляем 49 позиций: всё, что осталось с дефисом в имени (индекс или -п) и НЕ
-- имеет НИ ОДНОЙ транзакции (ни активной, ни мягко-удалённой). Базовые марки
-- (без дефиса) и сырьё не трогаются. NOT EXISTS — страховка от FK RESTRICT:
-- ни одна удаляемая позиция транзакций не имеет (проверено), но гард оставляем.
-- Остаток продукции меняться не должен (удаляемые = 0). Ожидается 2074.

BEGIN;

DO $$
DECLARE
  SATTY  constant uuid := 'ab426af3-ba63-4137-b7c6-368b425f934e';
  v_before numeric; v_after numeric; v_deleted int; v_left int;
BEGIN
  SELECT COALESCE(SUM(CASE WHEN mt.type IN ('income','return') THEN mt.quantity ELSE -mt.quantity END),0)
    INTO v_before FROM material_transactions mt JOIN materials m ON m.id = mt.material_id
   WHERE m.company_id = SATTY AND mt.deleted_at IS NULL AND m.name NOT IN ('Бетон','Арматура','Проволока');

  DELETE FROM materials m
   WHERE m.company_id = SATTY
     AND m.name LIKE '%-%'
     AND NOT EXISTS (SELECT 1 FROM material_transactions t WHERE t.material_id = m.id);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  SELECT COALESCE(SUM(CASE WHEN mt.type IN ('income','return') THEN mt.quantity ELSE -mt.quantity END),0)
    INTO v_after FROM material_transactions mt JOIN materials m ON m.id = mt.material_id
   WHERE m.company_id = SATTY AND mt.deleted_at IS NULL AND m.name NOT IN ('Бетон','Арматура','Проволока');

  IF v_before <> v_after THEN
    RAISE EXCEPTION 'РАСХОЖДЕНИЕ ОСТАТКА: было %, стало % — откат', v_before, v_after;
  END IF;

  SELECT count(*) INTO v_left FROM materials
   WHERE company_id = SATTY AND name NOT IN ('Бетон','Арматура','Проволока');

  RAISE NOTICE 'Удалено пустых позиций: % (ожидалось 49).', v_deleted;
  RAISE NOTICE 'Осталось карточек продукции: % (ожидалось 30, +3 сырьё = 33).', v_left;
  RAISE NOTICE 'Остаток продукции сохранён: % шт (ожидалось 2074).', v_after;
END $$;

COMMIT;
