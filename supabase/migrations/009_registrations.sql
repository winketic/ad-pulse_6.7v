CREATE TABLE IF NOT EXISTS registrations (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text        NOT NULL,
  contact_name text        NOT NULL,
  email        text        NOT NULL,
  phone        text,
  status       text        NOT NULL DEFAULT 'pending',
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Service role only — no direct client access
ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;
-- No RLS policies: all access goes through server-side service client
