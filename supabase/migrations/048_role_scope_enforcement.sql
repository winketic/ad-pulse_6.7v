-- Enforce the documented company roles at the data boundary.
-- workshop has no separate department/team entity in the current schema, so
-- its plan scope is the plans assigned directly to that profile.

BEGIN;

DROP POLICY IF EXISTS "mat_tx: members can select" ON material_transactions;
CREATE POLICY "mat_tx: role-scoped select"
  ON material_transactions FOR SELECT
  USING (
    company_id = private.get_my_company_id()
    AND EXISTS (
      SELECT 1
      FROM profiles p
      WHERE p.id = auth.uid()
        AND p.company_id = material_transactions.company_id
        AND (
          p.role IN ('admin', 'manager', 'warehouse')
          OR (p.role = 'workshop' AND type = 'expense' AND created_by = auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS "mat_tx: members can insert" ON material_transactions;
CREATE POLICY "mat_tx: role-scoped insert"
  ON material_transactions FOR INSERT
  WITH CHECK (
    company_id = private.get_my_company_id()
    AND created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM profiles p
      WHERE p.id = auth.uid()
        AND p.company_id = material_transactions.company_id
        AND (
          p.role IN ('admin', 'manager', 'warehouse')
          OR (p.role = 'workshop' AND type = 'expense')
        )
    )
  );

DROP POLICY IF EXISTS "plan: members can select" ON production_plans;
CREATE POLICY "plan: role-scoped select"
  ON production_plans FOR SELECT
  USING (
    company_id = private.get_my_company_id()
    AND EXISTS (
      SELECT 1
      FROM profiles p
      WHERE p.id = auth.uid()
        AND p.company_id = production_plans.company_id
        AND (p.role IN ('admin', 'manager') OR (p.role = 'workshop' AND assigned_to = auth.uid()))
    )
  );

-- Keep workshop users from querying the material breakdown of plans assigned
-- to other employees directly through the Supabase API.
DROP POLICY IF EXISTS "plan_material: members can select" ON plan_materials;
CREATE POLICY "plan_material: role-scoped select"
  ON plan_materials FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM production_plans p
      JOIN profiles pr ON pr.id = auth.uid()
      WHERE p.id = plan_materials.plan_id
        AND p.company_id = private.get_my_company_id()
        AND pr.company_id = p.company_id
        AND (
          pr.role IN ('admin', 'manager')
          OR (pr.role = 'workshop' AND p.assigned_to = auth.uid())
        )
    )
  );

-- A plan's company scope alone is insufficient: the FK on material_id does
-- not ensure that a referenced material belongs to the same tenant.
DROP POLICY IF EXISTS "plan_material: admin/manager can insert" ON plan_materials;
CREATE POLICY "plan_material: admin/manager own-company insert"
  ON plan_materials FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM production_plans p
      JOIN profiles pr ON pr.id = auth.uid()
      JOIN materials m ON m.id = plan_materials.material_id
      WHERE p.id = plan_materials.plan_id
        AND p.company_id = private.get_my_company_id()
        AND pr.company_id = p.company_id
        AND pr.role IN ('admin', 'manager')
        AND m.company_id = p.company_id
    )
  );

COMMIT;
