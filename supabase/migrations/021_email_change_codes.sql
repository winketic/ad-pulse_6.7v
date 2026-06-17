-- ============================================================
-- AD Pulse — email change verification codes
-- ============================================================
-- Stores temporary 6-digit codes sent to the user's current email
-- before allowing an email address change.

CREATE TABLE email_change_codes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code        text        NOT NULL,
  new_email   text        NOT NULL,
  expires_at  timestamptz NOT NULL,
  used        boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_change_codes_user_id ON email_change_codes(user_id);

-- Only accessible via service role — no client policies needed.
ALTER TABLE email_change_codes ENABLE ROW LEVEL SECURITY;
