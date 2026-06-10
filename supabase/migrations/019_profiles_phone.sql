-- Optional phone number for WhatsApp sender name lookup
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone text;

CREATE INDEX IF NOT EXISTS idx_profiles_phone ON profiles(phone) WHERE phone IS NOT NULL;
