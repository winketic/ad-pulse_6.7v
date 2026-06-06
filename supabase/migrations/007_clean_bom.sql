-- Clean BOM (U+FEFF) characters from wazzup_config credentials
-- BOM can be introduced when credentials are copy-pasted from certain editors

UPDATE wazzup_config
SET
  partner_email    = regexp_replace(partner_email,    E'\\uFEFF', '', 'g'),
  partner_password = regexp_replace(partner_password, E'\\uFEFF', '', 'g')
WHERE
  partner_email    ~ E'\\uFEFF'
  OR partner_password ~ E'\\uFEFF';
