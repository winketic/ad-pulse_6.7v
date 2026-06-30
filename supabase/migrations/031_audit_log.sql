-- ============================================================
-- AD Pulse — журнал изменений (production_plans, materials,
-- material_transactions)
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  table_name  text        NOT NULL,
  record_id   uuid        NOT NULL,
  action      text        NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
  changed_by  uuid        REFERENCES profiles(id),
  changed_at  timestamptz NOT NULL DEFAULT now(),
  old_data    jsonb,
  new_data    jsonb
);

CREATE INDEX IF NOT EXISTS idx_audit_log_record  ON audit_log(table_name, record_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_company ON audit_log(company_id);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Company members can read their own company's audit trail. No INSERT/
-- UPDATE/DELETE policy — only the SECURITY DEFINER trigger function below
-- (running as the table owner) writes to this table.
CREATE POLICY "audit_log: members can select"
  ON audit_log FOR SELECT
  USING (company_id = private.get_my_company_id());

-- ─── Trigger function ─────────────────────────────────────
-- SECURITY DEFINER so it can INSERT into audit_log despite no INSERT
-- policy existing for regular users. auth.uid() still resolves correctly
-- inside a SECURITY DEFINER function — it reads the request's JWT claim,
-- not the function's privilege context. NULL when the writer is the
-- service-role client (webhooks, cron) — there is no authenticated user.

CREATE OR REPLACE FUNCTION audit_log_trigger_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_record_id  uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_company_id := OLD.company_id;
    v_record_id  := OLD.id;
  ELSE
    v_company_id := NEW.company_id;
    v_record_id  := NEW.id;
  END IF;

  INSERT INTO audit_log (company_id, table_name, record_id, action, changed_by, old_data, new_data)
  VALUES (
    v_company_id,
    TG_TABLE_NAME,
    v_record_id,
    lower(TG_OP),
    auth.uid(),
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );

  RETURN NULL; -- AFTER trigger — return value is ignored
END;
$$;

-- ─── Triggers ─────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_audit_production_plans ON production_plans;
CREATE TRIGGER trg_audit_production_plans
  AFTER INSERT OR UPDATE OR DELETE ON production_plans
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger_fn();

DROP TRIGGER IF EXISTS trg_audit_materials ON materials;
CREATE TRIGGER trg_audit_materials
  AFTER INSERT OR UPDATE OR DELETE ON materials
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger_fn();

DROP TRIGGER IF EXISTS trg_audit_material_transactions ON material_transactions;
CREATE TRIGGER trg_audit_material_transactions
  AFTER INSERT OR UPDATE OR DELETE ON material_transactions
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger_fn();
