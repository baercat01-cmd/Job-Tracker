# Prompt for Onspace.ai: Fix "API can't see the portal link function"

Copy and paste the following into Onspace.ai (or your deployment/support chat) to get the customer portal link feature working.

---

**Prompt:**

I need the database for this app to support **customer portal links**. The app is showing: "API can't see the portal link function."

Please do the following in the **Supabase project** that backs this app (Supabase Dashboard → SQL Editor, or your equivalent):

**Step 1 – Add missing column (if not already present)**  
Run this first so the table has the column the functions expect:

```sql
-- Add show_line_item_prices to customer_portal_access if missing
ALTER TABLE public.customer_portal_access
  ADD COLUMN IF NOT EXISTS show_line_item_prices boolean NOT NULL DEFAULT false;
```

**Step 2 – Create the portal link RPCs**  
Run the full SQL from the project file `scripts/create-portal-link-rpc.sql`. It defines:

- `get_customer_portal_link_by_job(uuid)` – get portal link for a job  
- `get_customer_portal_access_by_token(text)` – get portal access by token (for customer portal)  
- `create_customer_portal_link(...)` – create a new portal link (bypasses RLS)  
- `update_customer_portal_link(...)` – update an existing portal link (bypasses RLS)  

Each function is `SECURITY DEFINER` and has `GRANT EXECUTE` for `anon` and `authenticated`.

**Step 3 – Reload PostgREST schema**  
After running the SQL, either:

- Run: `NOTIFY pgrst, 'reload schema';` in the SQL Editor, **or**  
- In Supabase: Project Settings → General → **Restart project**, then wait until it’s fully restarted.

Then try creating or updating a customer portal link in the app again. The "API can't see the portal link function" error should be resolved.

---

If Onspace doesn’t use Supabase directly, ask them to: **create these four PostgreSQL functions in the same database the app uses, with the same names and signatures as in `scripts/create-portal-link-rpc.sql`, and ensure the PostgREST/API layer is restarted or the schema reloaded** so the new functions are visible to the API.
