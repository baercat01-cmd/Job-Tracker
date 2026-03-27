# Environment Configuration for Production

## Critical Issue: localhost Connection Errors

If you see errors like:
- `net::ERR_CONNECTION_REFUSED` for `https://localhost/`
- Customer portal "Sign & use as contract" button does nothing
- Any Supabase requests failing with localhost errors

**Root cause**: The app is using `localhost` instead of your actual Supabase project URL.

---

## Required Environment Variables

The app requires these environment variables to be set **at build time**:

### For OnSpace Deployment

OnSpace automatically provides:
- `VITE_SUPABASE_URL` - Your Supabase project API URL
- `VITE_SUPABASE_ANON_KEY` - Your Supabase anon/public key

**These are auto-generated and should already be set correctly.**

**Subcontractor hub / portal job access:** URLs like `https://xxx.backend.onspace.ai` **do not run Supabase Edge Functions** (calls to `/functions/v1/...` return 404). The app uses **database RPCs** instead. If PostgREST reports **“Could not find … office_insert_portal_job_access … in the schema cache”**, run **`scripts/portal-job-access-json-rpcs.sql`** — it adds **single-argument `jsonb` RPCs** (`office_portal_job_access_insert_json`, `office_portal_job_access_list_json`, etc.) that OnSpace/PostgREST exposes reliably; then **`NOTIFY pgrst, 'reload schema';`** (included at end of that script). You can still run **`scripts/portal-job-access-onspace-rpcs.sql`** for the multi-arg versions. If inserts hit **RLS**, run **`scripts/portal-job-access-emergency-rls-off.sql`** on the same database.

**Optional** — if you host Edge Functions on a separate `*.supabase.co` project that shares the same data, set **`VITE_SUPABASE_FUNCTIONS_URL`** to that API origin (e.g. `https://abcdefghijklmnop.supabase.co`) so portal-job-access can still be invoked.

### Expected Values

✅ **Correct** format for `VITE_SUPABASE_URL`:
```
https://qlpaecryapnfqmwlqlpa.backend.onspace.ai
```
or
```
https://<project-ref>.supabase.co
```

❌ **WRONG** formats (will cause errors):
```
https://localhost/
http://localhost:54321
localhost
```

---

## How to Verify Configuration

### 1. Check Current Configuration

Open browser DevTools Console on your deployed app and look for:
```
Supabase URL: https://...
```

If it shows `localhost`, the environment variables are not set correctly.

### 2. Production Build Safeguard

The app now includes automatic validation that will **throw an error** if:
- `VITE_SUPABASE_URL` contains "localhost" or "127.0.0.1" in production build
- Missing `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY`

This prevents deploying a broken configuration.

---

## How to Fix

### For OnSpace Platform

1. **Verify environment variables in OnSpace dashboard**:
   - Go to your OnSpace project settings
   - Check that `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set
   - They should point to your actual Supabase backend

2. **Rebuild and redeploy**:
   - Trigger a fresh build/deploy in OnSpace
   - Environment variables are baked into the build at build time
   - Clear any caches if issues persist

3. **Do NOT use a local `.env` file in production**:
   - Local `.env` files should only be used for local development
   - Production uses platform environment variables

### For Other Hosting (Vercel, Netlify, etc.)

1. Add environment variables in your hosting platform:
   ```
   VITE_SUPABASE_URL=https://qlpaecryapnfqmwlqlpa.backend.onspace.ai
   VITE_SUPABASE_ANON_KEY=your-anon-key-here
   ```

2. Rebuild your project:
   ```bash
   npm run build
   ```

3. Redeploy the new build

---

## Verify the Fix

After redeploying:

1. **Open customer portal** in your browser
2. **Open DevTools Console** (F12)
3. **Check for**:
   - No localhost errors
   - Supabase URL logged correctly (in dev mode)
   - No `net::ERR_CONNECTION_REFUSED` errors

4. **Test "Sign & use as contract"**:
   - Fill in name and email
   - Check the terms checkbox
   - Click "Sign & use as contract"
   - Should see request to `https://qlpaecryapnfqmwlqlpa.backend.onspace.ai/...`
   - Button should update to "Signed" or show a clear API error (not connection refused)

---

## Common Issues

### Issue: Still seeing localhost after rebuild
**Solution**: Clear browser cache, hard refresh (Ctrl+Shift+R), or open in incognito mode

### Issue: Environment variables not found
**Solution**: Ensure they're prefixed with `VITE_` (required for Vite to expose them to the client)

### Issue: Build succeeds but runtime shows localhost
**Solution**: The build cached old values. Clear build cache and rebuild:
```bash
rm -rf dist node_modules/.vite
npm run build
```

---

## Technical Details

### How It Works

1. **Build time**: Vite reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from environment
2. **Static replacement**: Vite replaces `import.meta.env.VITE_SUPABASE_URL` with the actual value in the built code
3. **Runtime**: The app uses the baked-in value to connect to Supabase

### File Locations

- **Supabase client initialization**: `src/lib/supabase.ts`
- **Validation logic**: Checks for localhost in production mode
- **Error messages**: Clear diagnostics if misconfigured

---

## Success Criteria

✅ No `localhost` in production builds  
✅ Customer portal "Sign & use as contract" works  
✅ All Supabase requests go to correct URL  
✅ No `ERR_CONNECTION_REFUSED` errors  
✅ Clear error messages if misconfigured  
