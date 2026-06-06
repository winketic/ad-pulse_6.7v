ALTER TABLE companies ADD COLUMN IF NOT EXISTS telegram_chat_id text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS telegram_connected boolean DEFAULT false;
