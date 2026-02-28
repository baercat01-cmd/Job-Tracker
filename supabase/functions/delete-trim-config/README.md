# delete-trim-config

Allows the Trim Calculator to delete saved configs. Uses the service role so delete works even when table permissions or RLS block the client.

**Deploy once** (from project root, with Supabase CLI linked to your project):

```bash
supabase functions deploy delete-trim-config
```

After deployment, delete in the app will work without any SQL changes.
