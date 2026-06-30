-- ============================================================
-- AD Pulse — назначение исполнителя на производственный план
-- ============================================================

ALTER TABLE production_plans ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES profiles(id);

CREATE INDEX IF NOT EXISTS idx_production_plans_assigned_to ON production_plans(assigned_to);

COMMENT ON COLUMN production_plans.assigned_to IS
  'Пользователь, ответственный за выполнение плана. Nullable — план может быть без исполнителя.';
