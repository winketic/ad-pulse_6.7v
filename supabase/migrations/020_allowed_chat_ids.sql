-- Move allowed_chat_ids to wazzup_tokens (always has a row when WhatsApp is connected)
ALTER TABLE wazzup_tokens
  ADD COLUMN IF NOT EXISTS allowed_chat_ids text[] DEFAULT '{}';
