-- 037_banner_color_cadence.sql
-- Retire the legacy mint (#00f5c4) profile banner default introduced in
-- migration 014. New profiles default to Pulse Blue; existing profiles still
-- carrying the old mint default are migrated to Pulse Blue too, so no avatar
-- banner renders the dead accent anywhere in «Каданс».
-- Applied manually in Supabase SQL Editor.

ALTER TABLE profiles
  ALTER COLUMN banner_color SET DEFAULT '#5A8DF0';

UPDATE profiles
  SET banner_color = '#5A8DF0'
  WHERE banner_color = '#00f5c4';
