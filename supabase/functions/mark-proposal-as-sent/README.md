# mark-proposal-as-sent

Edge Function used by the "Mark as Sent" button. Called automatically when direct
PostgREST updates fail (e.g. due to RLS or a stale schema cache).

Uses the **service role key** (available automatically in Edge Functions) which bypasses
Row Level Security so the updates always go through.

## Deploy

```bash
supabase functions deploy mark-proposal-as-sent
```

No extra secrets or config needed — `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
are injected automatically by Supabase.
