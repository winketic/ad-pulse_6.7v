CREATE TABLE IF NOT EXISTS material_thresholds (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid          NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  material_id uuid          NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  min_quantity decimal(14,4) NOT NULL CHECK (min_quantity >= 0),
  created_at  timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (company_id, material_id)
);

ALTER TABLE material_thresholds ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_material_thresholds_company ON material_thresholds(company_id);
CREATE INDEX IF NOT EXISTS idx_material_thresholds_material ON material_thresholds(material_id);

CREATE POLICY "threshold: members can select"
  ON material_thresholds FOR SELECT
  USING (company_id = private.get_my_company_id());

CREATE POLICY "threshold: admin/manager can insert"
  ON material_thresholds FOR INSERT
  WITH CHECK (
    company_id = private.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

CREATE POLICY "threshold: admin/manager can update"
  ON material_thresholds FOR UPDATE
  USING (
    company_id = private.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

CREATE POLICY "threshold: admin/manager can delete"
  ON material_thresholds FOR DELETE
  USING (
    company_id = private.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
  );
