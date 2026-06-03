-- ============================================================
-- AD Pulse — WhatsApp / Wazzup webhook integration
-- ============================================================

-- Raw inbound messages from Wazzup
CREATE TABLE wazzup_messages (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  message_id    text        NOT NULL UNIQUE,   -- Wazzup message ID (idempotency key)
  channel_id    text        NOT NULL,
  direction     text        NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  sender_phone  text,
  raw_text      text,
  parsed        boolean     NOT NULL DEFAULT false,
  needs_review  boolean     NOT NULL DEFAULT false,
  parse_result  jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wazzup_messages_company    ON wazzup_messages(company_id);
CREATE INDEX idx_wazzup_messages_message_id ON wazzup_messages(message_id);
CREATE INDEX idx_wazzup_messages_created_at ON wazzup_messages(created_at DESC);
CREATE INDEX idx_wazzup_messages_pending    ON wazzup_messages(company_id, parsed, direction);

-- Add webhook tracking fields to wazzup_tokens
ALTER TABLE wazzup_tokens
  ADD COLUMN IF NOT EXISTS webhook_id  text,
  ADD COLUMN IF NOT EXISTS channel_ids text[] NOT NULL DEFAULT ARRAY[]::text[];

-- Add WhatsApp source tracking to material_transactions
ALTER TABLE material_transactions
  ADD COLUMN IF NOT EXISTS source            text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'whatsapp')),
  ADD COLUMN IF NOT EXISTS wazzup_message_id uuid
    REFERENCES wazzup_messages(id) ON DELETE SET NULL;

-- created_by can be null for auto-created webhook transactions
ALTER TABLE material_transactions
  ALTER COLUMN created_by DROP NOT NULL;

CREATE INDEX idx_mat_tx_wazzup_msg ON material_transactions(wazzup_message_id)
  WHERE wazzup_message_id IS NOT NULL;

-- RLS: wazzup_messages only visible to own company
ALTER TABLE wazzup_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wazzup_msg: members can select own company"
  ON wazzup_messages FOR SELECT
  USING (company_id = private.get_my_company_id());
