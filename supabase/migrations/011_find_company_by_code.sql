CREATE OR REPLACE FUNCTION find_company_by_code(code_prefix text)
RETURNS TABLE(id uuid, name text)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT id, name FROM companies
  WHERE id::text LIKE code_prefix || '%'
  LIMIT 1;
$$;
