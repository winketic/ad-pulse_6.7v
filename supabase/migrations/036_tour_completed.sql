-- 036_tour_completed.sql
-- Onboarding tour completion flag on profiles.
-- New users start with false → tour auto-launches on first dashboard visit.
-- Existing users are backfilled to true so the tour does NOT retro-fire for
-- everyone the moment this migration lands.
-- Applied manually in Supabase SQL Editor (shared staging+production DB).

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS tour_completed boolean NOT NULL DEFAULT false;

-- Backfill: everyone who already exists has effectively "seen" the app.
UPDATE profiles SET tour_completed = true WHERE tour_completed = false;
