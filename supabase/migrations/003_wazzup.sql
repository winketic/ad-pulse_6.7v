-- ============================================================
-- AD Pulse — Wazzup OAuth integration tables
-- ============================================================

-- Temporary storage during OAuth PKCE flow (expires naturally or on use)
CREATE TABLE oauth_state (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  state        text        NOT NULL UNIQUE,
  code_verifier text       NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_oauth_state_state       ON oauth_state(state);
CREATE INDEX idx_oauth_state_created_at  ON oauth_state(created_at DESC);

-- Long-term per-company Wazzup token storage
CREATE TABLE wazzup_tokens (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE UNIQUE,
  access_token  text        NOT NULL,
  refresh_token text        NOT NULL,
  expires_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- oauth_state: only accessible via service role (no client access needed)
ALTER TABLE oauth_state ENABLE ROW LEVEL SECURITY;

-- wazzup_tokens: members of the company can SELECT to check connection status
ALTER TABLE wazzup_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wazzup_tokens: members can select own company"
  ON wazzup_tokens FOR SELECT
  USING (company_id = private.get_my_company_id());
