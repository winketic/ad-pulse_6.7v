-- Fix numeric field overflow for large quantities
ALTER TABLE material_transactions
  ALTER COLUMN quantity TYPE numeric(20, 4);

ALTER TABLE plan_materials
  ALTER COLUMN planned_quantity TYPE numeric(20, 4),
  ALTER COLUMN actual_quantity  TYPE numeric(20, 4);

-- Remove check that prevents actual_quantity going negative (defect transactions)
ALTER TABLE production_plans
  DROP CONSTRAINT IF EXISTS production_plans_actual_quantity_check;
