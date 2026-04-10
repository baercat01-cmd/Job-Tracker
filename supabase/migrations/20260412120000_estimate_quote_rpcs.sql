-- Dropped: estimate flow uses magic p_change_notes on create_proposal_version instead (PostgREST cache).
DROP FUNCTION IF EXISTS public.create_customer_estimate_quote(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.convert_estimate_to_formal_proposal(uuid);
