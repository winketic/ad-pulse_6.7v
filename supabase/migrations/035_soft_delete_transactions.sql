-- ============================================================
-- AD Pulse — soft delete for material_transactions (admin only)
-- ============================================================
-- Deleted transactions stay in the table (deleted_at set) so the audit
-- trail and "показать удалённые" view survive. Every balance/report query
-- must filter `deleted_at IS NULL`.

ALTER TABLE material_transactions
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES profiles(id);

-- Fast path for the overwhelmingly common "not deleted" balance scans.
CREATE INDEX IF NOT EXISTS idx_mat_tx_active
  ON material_transactions(company_id)
  WHERE deleted_at IS NULL;

-- material_transactions had SELECT/INSERT/DELETE policies but NO UPDATE —
-- a soft delete is an UPDATE, so admins need an explicit UPDATE policy.
-- Non-admins still cannot mutate rows (transactions stay immutable for them).
DROP POLICY IF EXISTS "mat_tx: admin can update" ON material_transactions;
CREATE POLICY "mat_tx: admin can update"
  ON material_transactions FOR UPDATE
  USING (
    company_id = private.get_my_company_id()
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    company_id = private.get_my_company_id()
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- NOTE: the existing audit_log trigger (migration 031) fires on UPDATE and
-- stores to_jsonb(NEW), so deleted_at/deleted_by land in new_data
-- automatically — no trigger change needed.
