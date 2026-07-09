-- FIX: "permission denied for schema private" in create_production_transaction.
--
-- private.get_my_company_id() is referenced by every RLS policy — Postgres
-- does not ACL-check functions inside policy expressions, so the app worked.
-- But create_production_transaction (SECURITY INVOKER, migrations 023/024)
-- calls the function DIRECTLY in its body as the authenticated user, which
-- DOES require USAGE on the schema. That grant never existed, so the
-- "Производство" flow failed for every user since day one.

GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.get_my_company_id() TO authenticated;
