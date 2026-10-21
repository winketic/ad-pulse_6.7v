-- 052_find_company_by_code_restrict.sql
--
-- SECURITY FIX: public read path to public.companies via find_company_by_code.
--
-- Migration 011 created public.find_company_by_code(text) as SECURITY DEFINER
-- but without SET search_path, and — as every new function — it was EXECUTE-able
-- by PUBLIC by default. The function body runs with the owner's privileges, so
-- it bypasses RLS on public.companies. Consequently, before this revoke ANY
-- holder of the public anon key could call
--     POST /rest/v1/rpc/find_company_by_code  {"code_prefix": "a"}
-- and walk UUID prefixes ("a", "ab", "abc", ...) to harvest company ids and
-- names without authenticating. UUIDs are random, but the function returns the
-- first match and there is no rate limit, so the whole code space is enumerable.
--
-- The function has NO client callers: a repository-wide search finds exactly one
-- usage, app/api/telegram/webhook/route.ts:91, which runs on the server with the
-- service-role client and passes an 8-hex-character prefix taken from the bot
-- message (already validated there as /^[a-f0-9]{8}$/i). No browser/mobile code,
-- no RLS policy and no other SQL object references it.
--
-- This migration does three things:
--
--   1. Pins search_path = '' on the SECURITY DEFINER function so a caller cannot
--      shadow public.companies (or operators) through a schema earlier in
--      search_path. Every non-pg_catalog reference in the body is schema-qualified.
--
--   2. Rejects any code_prefix that is not exactly 8 hex characters
--      (^[0-9a-fA-F]{8}$). Because the lookup is LIKE code_prefix || '%', a value
--      such as '%' or '_' used to degrade the prefix search into "return the
--      first company in the table". Now such input returns 0 rows. This is
--      defense in depth in case EXECUTE is ever re-granted by accident. The
--      legitimate caller always sends exactly 8 hex chars, so its behaviour is
--      unchanged (matching itself stays case-sensitive, exactly as before: the
--      uuid text representation is lower-case, so an upper-case prefix simply
--      matches nothing).
--
--   3. Revokes EXECUTE from PUBLIC, anon and authenticated, and grants it to
--      service_role only — the role the Telegram webhook actually uses.
--
-- Return columns (id uuid, name text) and the successful-path semantics
-- (8-char hex prefix -> the matching company, LIMIT 1) are unchanged.
--
-- Idempotent: CREATE OR REPLACE keeps the existing ACL and body semantics, the
-- REVOKEs are idempotent, the GRANT is idempotent, so a second run is a no-op.

BEGIN;

CREATE OR REPLACE FUNCTION public.find_company_by_code(code_prefix text)
RETURNS TABLE(id uuid, name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id, name
  FROM public.companies
  WHERE code_prefix ~ '^[0-9a-fA-F]{8}$'
    AND id::text LIKE code_prefix || '%'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.find_company_by_code(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.find_company_by_code(text) FROM anon;
REVOKE ALL ON FUNCTION public.find_company_by_code(text) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.find_company_by_code(text) TO service_role;

COMMIT;
