-- ============================================================
-- AD Pulse — Wazzup partner credentials (per company, admin-only)
-- ============================================================

CREATE TABLE wazzup_config (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE UNIQUE,
  partner_email   text        NOT NULL,
  partner_password text       NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Service role only — no direct client access
ALTER TABLE wazzup_config ENABLE ROW LEVEL SECURITY;

-- No RLS policies: all access goes through server-side service client
-- Admins configure credentials via server actions, never exposed to client
