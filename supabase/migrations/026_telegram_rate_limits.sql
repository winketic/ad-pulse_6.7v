-- ============================================================
-- AD Pulse — rate limiting for Telegram connect-code attempts
-- ============================================================
-- Anyone who messages @adpulse_alerts_bot can guess an 8-hex-char company
-- code and hijack that company's alerts. This table backs a per-chat_id
-- fixed-window limiter (5 failed attempts / 10 minutes) enforced in
-- app/api/telegram/webhook/route.ts. Service-role only — no client ever
-- reads/writes this table directly, so RLS has no policies (default deny).

CREATE TABLE IF NOT EXISTS telegram_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id text NOT NULL UNIQUE,
  attempts integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE telegram_rate_limits ENABLE ROW LEVEL SECURITY;
