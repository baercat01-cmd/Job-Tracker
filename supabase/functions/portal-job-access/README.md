# portal-job-access

Inserts/updates/deletes `public.portal_job_access` using the **service role**, so office users can grant subcontractor job access even when RLS is enabled on that table.

## Deploy

From the repo root (with Supabase CLI logged in):

```bash
supabase functions deploy portal-job-access --no-verify-jwt
```

`--no-verify-jwt` matches this app’s PIN-based office login: the browser often has no Supabase Auth session, but the anon key is still sent when invoking the function.

## Invoke (app)

The web app calls this via `supabase.functions.invoke('portal-job-access', { body: { action, ... } })`.

Actions:

- `insert` / `update` / `delete` — office grants (service role bypasses RLS).
- `list_for_subcontractor` — `{ portal_user_id }` returns `{ ok, rows }` with `portal_job_access` rows and nested `jobs` (subcontractor portal uses anon client; RLS often blocks direct `select`).
