-- Run this in Supabase → SQL Editor if tax exempt still won't save after running the migration.
-- This grants the app permission to call the set_quote_tax_exempt function and reloads the API schema.

GRANT EXECUTE ON FUNCTION public.set_quote_tax_exempt(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_quote_tax_exempt(uuid, uuid, boolean) TO service_role;

NOTIFY pgrst, 'reload schema';
