-- ============================================================
-- AD Pulse — Wazzup media message support
-- ============================================================

ALTER TABLE wazzup_messages
  ADD COLUMN IF NOT EXISTS content_type text NOT NULL DEFAULT 'text'
    CHECK (content_type IN ('text', 'voice', 'image', 'document', 'other')),
  ADD COLUMN IF NOT EXISTS media_url text;

CREATE INDEX idx_wazzup_messages_content_type
  ON wazzup_messages(company_id, content_type)
  WHERE content_type != 'text';
