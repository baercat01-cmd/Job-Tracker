# set-job-tax-exempt

Saves the Tax Exempt checkbox for a job so it syncs across all users. Tries RPC and direct update first; if PostgREST schema cache is stale, uses raw SQL when `DATABASE_URL` is set.

## Deploy

```bash
supabase functions deploy set-job-tax-exempt
```

## Optional: DATABASE_URL (for stale schema cache)

If you see "Tax exempt could not be saved" even after running `scripts/setup-tax-exempt-for-job.sql`, add this secret so the function can update the database directly:

1. Supabase Dashboard → Edge Functions → set-job-tax-exempt → Secrets
2. Add secret: `DATABASE_URL` = your project's **Connection string (URI)** from Project Settings → Database

Use the **Transaction** or **Session** pooler URI (e.g. `postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres`).
