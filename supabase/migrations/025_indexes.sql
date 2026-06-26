-- ============================================================
-- AD Pulse — composite indexes for hot-path lookups
-- ============================================================
-- wazzup_messages(company_id, chat_id) — parseAndSave.ts filters on both
-- columns to build conversation context on every inbound WhatsApp message.
-- material_transactions(company_id, material_id) — balance/threshold/alert
-- checks filter on both columns repeatedly (parseAndSave.ts, transactions
-- actions). Previously only single-column indexes existed on each.

CREATE INDEX IF NOT EXISTS idx_wazzup_messages_company_chat
  ON wazzup_messages(company_id, chat_id);

CREATE INDEX IF NOT EXISTS idx_material_transactions_company_material
  ON material_transactions(company_id, material_id);
