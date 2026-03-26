# Prompt for OnSpace.ai: Fix office building / estimator “plan RPCs missing”

Copy everything in the **Prompt** section below into OnSpace.ai (or your deployment chat) so the database behind `https://YOUR_REF.backend.onspace.ai` gets the functions the app calls.

The app first calls **single-argument `jsonb` RPCs** (`office_*_json`) because PostgREST on OnSpace often does **not** expose multi-argument functions like `office_create_building_plan` in the API schema cache—even when they exist in Postgres.

---

## Prompt (paste into OnSpace)

My office **Building Estimator** fails with errors like **“Could not find the function public.office_create_building_plan … in the schema cache”** or the in-app toast **“Building plan RPCs missing or API cache stale.”**

Please apply SQL to the **same PostgreSQL database** that serves my app’s `VITE_SUPABASE_URL` (e.g. `*.backend.onspace.ai`):

1. **If missing**, create tables `public.building_plans`, `public.building_plan_versions`, and `public.building_plan_shares` plus RLS and related RPCs from the repo file  
   `supabase/migrations/20260325090000_building_plans_and_shares.sql`  
   (or run that entire script in the SQL editor).

2. **Required for OnSpace**: create these three functions and grants by running the full script in  
   `scripts/office-building-plan-json-rpcs.sql`  
   (canonical migration: `supabase/migrations/20260328140000_office_building_plan_json_rpcs.sql`).  
   They must be named exactly:
   - `office_create_building_plan_json(p_payload jsonb)`
   - `office_update_building_plan_json(p_payload jsonb)`
   - `office_list_building_plans_for_job_json(p_payload jsonb)`  
   Each must be `SECURITY DEFINER`, `SET search_path = public`, with `GRANT EXECUTE … TO anon, authenticated`.

3. **Reload the API schema** after SQL succeeds, e.g. run:  
   `select pg_notify('pgrst', 'reload schema');`  
   or restart the PostgREST / API layer if that is how your platform works.

4. Confirm the app’s **`VITE_SUPABASE_URL`** points at this same backend, then I will hard-refresh the browser.

The frontend calls the `*_json` RPCs first, then falls back to the multi-arg `office_create_building_plan` / `office_update_building_plan` / `office_list_building_plans_for_job` if those appear in the schema cache.

---

## If OnSpace cannot read repo files

Ask the operator to run the SQL from **`scripts/office-building-plan-json-rpcs.sql`** in your project clone, or paste that file’s contents into the hosted SQL editor. Tables must exist first (step 1).
