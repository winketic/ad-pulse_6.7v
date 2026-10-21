-- Prevent authenticated users from changing their own tenant or role through
-- direct PostgREST updates. Service-role server actions remain the controlled
-- path for administrative role changes and invitations.
BEGIN;

CREATE OR REPLACE FUNCTION private.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (NEW.role IS DISTINCT FROM OLD.role OR NEW.company_id IS DISTINCT FROM OLD.company_id)
     AND COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'role and company_id can only be changed by a trusted server action'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_privilege_escalation ON public.profiles;
CREATE TRIGGER profiles_prevent_privilege_escalation
  BEFORE UPDATE OF role, company_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.prevent_profile_privilege_escalation();

-- A valid FK is not sufficient: related rows must belong to the same tenant.
DROP POLICY IF EXISTS "mat_tx: role-scoped insert" ON public.material_transactions;
CREATE POLICY "mat_tx: role-scoped insert"
  ON public.material_transactions FOR INSERT
  WITH CHECK (
    company_id = private.get_my_company_id()
    AND created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.materials m
      WHERE m.id = material_transactions.material_id
        AND m.company_id = material_transactions.company_id
    )
    AND (
      counterparty_id IS NULL OR EXISTS (
        SELECT 1 FROM public.counterparties c
        WHERE c.id = material_transactions.counterparty_id
          AND c.company_id = material_transactions.company_id
      )
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.company_id = material_transactions.company_id
        AND (
          p.role IN ('admin', 'manager', 'warehouse')
          OR (p.role = 'workshop' AND type = 'expense')
        )
    )
  );

DROP POLICY IF EXISTS "plan_material: admin/manager own-company insert" ON public.plan_materials;
CREATE POLICY "plan_material: admin/manager own-company insert"
  ON public.plan_materials FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.production_plans p
      JOIN public.profiles pr ON pr.id = auth.uid()
      JOIN public.materials m ON m.id = plan_materials.material_id
      WHERE p.id = plan_materials.plan_id
        AND p.company_id = private.get_my_company_id()
        AND pr.company_id = p.company_id
        AND pr.role IN ('admin', 'manager')
        AND m.company_id = p.company_id
    )
  );

DROP POLICY IF EXISTS "plan_material: admin/manager can update" ON public.plan_materials;
CREATE POLICY "plan_material: admin/manager own-company update"
  ON public.plan_materials FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.production_plans p
      JOIN public.profiles pr ON pr.id = auth.uid()
      WHERE p.id = plan_materials.plan_id
        AND p.company_id = private.get_my_company_id()
        AND pr.company_id = p.company_id
        AND pr.role IN ('admin', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.production_plans p
      JOIN public.profiles pr ON pr.id = auth.uid()
      JOIN public.materials m ON m.id = plan_materials.material_id
      WHERE p.id = plan_materials.plan_id
        AND p.company_id = private.get_my_company_id()
        AND pr.company_id = p.company_id
        AND pr.role IN ('admin', 'manager')
        AND m.company_id = p.company_id
    )
  );

COMMIT;
