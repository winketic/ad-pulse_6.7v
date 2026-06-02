-- ============================================================
-- AD Pulse — initial schema
-- ============================================================

-- Private schema: functions here are NOT exposed via the Supabase REST API.
CREATE SCHEMA IF NOT EXISTS private;

-- ─── Enums ────────────────────────────────────────────────
CREATE TYPE user_role AS ENUM ('admin', 'manager', 'warehouse', 'workshop');
CREATE TYPE transaction_type AS ENUM ('income', 'expense', 'return', 'defect');
CREATE TYPE plan_status AS ENUM ('active', 'completed', 'cancelled');

-- ─── Tables ───────────────────────────────────────────────

CREATE TABLE companies (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Mirrors auth.users; one row per authenticated user.
CREATE TABLE profiles (
  id          uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   text        NOT NULL,
  role        user_role   NOT NULL DEFAULT 'warehouse',
  company_id  uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE materials (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid          NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        text          NOT NULL,
  unit        text          NOT NULL,               -- кг, тонна, шт, м3 …
  gost_norm   decimal(14,4),                        -- норма по ГОСТ
  created_at  timestamptz   NOT NULL DEFAULT now()
);

CREATE TABLE material_transactions (
  id          uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid             NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  material_id uuid             NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
  type        transaction_type NOT NULL,
  quantity    decimal(14,4)    NOT NULL CHECK (quantity > 0),
  note        text,
  created_by  uuid             NOT NULL REFERENCES profiles(id),
  created_at  timestamptz      NOT NULL DEFAULT now()
);

CREATE TABLE production_plans (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name             text        NOT NULL,
  planned_quantity decimal(14,4) NOT NULL CHECK (planned_quantity > 0),
  actual_quantity  decimal(14,4) NOT NULL DEFAULT 0 CHECK (actual_quantity >= 0),
  start_date       date        NOT NULL,
  end_date         date        NOT NULL,
  status           plan_status NOT NULL DEFAULT 'active',
  created_by       uuid        NOT NULL REFERENCES profiles(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

CREATE TABLE plan_materials (
  id               uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id          uuid         NOT NULL REFERENCES production_plans(id) ON DELETE CASCADE,
  material_id      uuid         NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
  planned_quantity decimal(14,4) NOT NULL CHECK (planned_quantity > 0),
  actual_quantity  decimal(14,4) NOT NULL DEFAULT 0 CHECK (actual_quantity >= 0),
  UNIQUE (plan_id, material_id)
);

-- ─── Indexes ──────────────────────────────────────────────

CREATE INDEX idx_profiles_company_id              ON profiles(company_id);
CREATE INDEX idx_materials_company_id             ON materials(company_id);
CREATE INDEX idx_mat_tx_company_id                ON material_transactions(company_id);
CREATE INDEX idx_mat_tx_material_id               ON material_transactions(material_id);
CREATE INDEX idx_mat_tx_created_by                ON material_transactions(created_by);
CREATE INDEX idx_mat_tx_created_at                ON material_transactions(created_at DESC);
CREATE INDEX idx_production_plans_company_id      ON production_plans(company_id);
CREATE INDEX idx_production_plans_status          ON production_plans(status);
CREATE INDEX idx_plan_materials_plan_id           ON plan_materials(plan_id);
CREATE INDEX idx_plan_materials_material_id       ON plan_materials(material_id);

-- ─── Helper function (SECURITY DEFINER bypasses RLS) ─────
-- Returns the company_id of the currently authenticated user.
-- SECURITY DEFINER means it runs as the function owner (postgres),
-- so it can read profiles without triggering the profiles RLS policy.
CREATE OR REPLACE FUNCTION private.get_my_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid();
$$;

-- ─── Row Level Security ───────────────────────────────────

ALTER TABLE companies           ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials           ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_plans    ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_materials      ENABLE ROW LEVEL SECURITY;

-- ── companies ────────────────────────────────────────────

CREATE POLICY "company: members can select"
  ON companies FOR SELECT
  USING (id = private.get_my_company_id());

CREATE POLICY "company: admin can update"
  ON companies FOR UPDATE
  USING (
    id = private.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ── profiles ─────────────────────────────────────────────

CREATE POLICY "profile: members can select same company"
  ON profiles FOR SELECT
  USING (company_id = private.get_my_company_id());

CREATE POLICY "profile: user can update own row"
  ON profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Admin creates profiles for new team members in the same company.
CREATE POLICY "profile: admin can insert"
  ON profiles FOR INSERT
  WITH CHECK (
    company_id = private.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "profile: admin can delete (not self)"
  ON profiles FOR DELETE
  USING (
    company_id = private.get_my_company_id()
    AND id <> auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ── materials ─────────────────────────────────────────────

CREATE POLICY "material: members can select"
  ON materials FOR SELECT
  USING (company_id = private.get_my_company_id());

CREATE POLICY "material: admin/manager can insert"
  ON materials FOR INSERT
  WITH CHECK (
    company_id = private.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

CREATE POLICY "material: admin/manager can update"
  ON materials FOR UPDATE
  USING (
    company_id = private.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

CREATE POLICY "material: admin can delete"
  ON materials FOR DELETE
  USING (
    company_id = private.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ── material_transactions ─────────────────────────────────

CREATE POLICY "mat_tx: members can select"
  ON material_transactions FOR SELECT
  USING (company_id = private.get_my_company_id());

-- Any authenticated member can record a transaction (warehouse / workshop).
CREATE POLICY "mat_tx: members can insert"
  ON material_transactions FOR INSERT
  WITH CHECK (
    company_id = private.get_my_company_id()
    AND created_by = auth.uid()
  );

-- Transactions are immutable for non-admins.
CREATE POLICY "mat_tx: admin can delete"
  ON material_transactions FOR DELETE
  USING (
    company_id = private.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ── production_plans ─────────────────────────────────────

CREATE POLICY "plan: members can select"
  ON production_plans FOR SELECT
  USING (company_id = private.get_my_company_id());

CREATE POLICY "plan: admin/manager can insert"
  ON production_plans FOR INSERT
  WITH CHECK (
    company_id = private.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

CREATE POLICY "plan: admin/manager can update"
  ON production_plans FOR UPDATE
  USING (
    company_id = private.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

CREATE POLICY "plan: admin can delete"
  ON production_plans FOR DELETE
  USING (
    company_id = private.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ── plan_materials ────────────────────────────────────────

-- Access is derived from the parent production_plan's company_id.
CREATE POLICY "plan_material: members can select"
  ON plan_materials FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM production_plans
      WHERE id = plan_materials.plan_id
        AND company_id = private.get_my_company_id()
    )
  );

CREATE POLICY "plan_material: admin/manager can insert"
  ON plan_materials FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM production_plans p
      JOIN profiles pr ON pr.id = auth.uid()
      WHERE p.id = plan_materials.plan_id
        AND p.company_id = private.get_my_company_id()
        AND pr.role IN ('admin', 'manager')
    )
  );

CREATE POLICY "plan_material: admin/manager can update"
  ON plan_materials FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM production_plans p
      JOIN profiles pr ON pr.id = auth.uid()
      WHERE p.id = plan_materials.plan_id
        AND p.company_id = private.get_my_company_id()
        AND pr.role IN ('admin', 'manager')
    )
  );

CREATE POLICY "plan_material: admin can delete"
  ON plan_materials FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM production_plans p
      JOIN profiles pr ON pr.id = auth.uid()
      WHERE p.id = plan_materials.plan_id
        AND p.company_id = private.get_my_company_id()
        AND pr.role = 'admin'
    )
  );

-- ─── Trigger: auto-update actual_quantity on transactions ─
-- Keeps production_plans.actual_quantity in sync automatically.
CREATE OR REPLACE FUNCTION sync_plan_actual_quantity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Recalculate actual_quantity for all plans that reference this material
  UPDATE production_plans pp
  SET actual_quantity = (
    SELECT COALESCE(SUM(
      CASE mt.type
        WHEN 'income'  THEN  mt.quantity
        WHEN 'expense' THEN -mt.quantity
        WHEN 'return'  THEN  mt.quantity
        WHEN 'defect'  THEN -mt.quantity
      END
    ), 0)
    FROM material_transactions mt
    WHERE mt.material_id = COALESCE(NEW.material_id, OLD.material_id)
      AND mt.company_id  = pp.company_id
  )
  WHERE pp.company_id = COALESCE(NEW.company_id, OLD.company_id)
    AND EXISTS (
      SELECT 1 FROM plan_materials pm
      WHERE pm.plan_id     = pp.id
        AND pm.material_id = COALESCE(NEW.material_id, OLD.material_id)
    );

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_sync_plan_quantity
  AFTER INSERT OR UPDATE OR DELETE ON material_transactions
  FOR EACH ROW EXECUTE FUNCTION sync_plan_actual_quantity();
