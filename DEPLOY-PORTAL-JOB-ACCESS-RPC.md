# Portal Job Access RPC Deployment Guide

## Overview
This document outlines the deployment of RPC functions for managing subcontractor portal job access on OnSpace Cloud, which uses PIN-based authentication (user_profiles) instead of Supabase Auth.

## Database Migration

### Step 1: Deploy RPC Functions
Run the migration that creates the RPC functions:

```bash
# Option A: Run the migration file
psql -f supabase/migrations/20260326000000_portal_job_access_onspace_rpcs.sql

# Option B: Run the script directly
psql -f scripts/portal-job-access-onspace-rpcs.sql
```

This creates the following functions:
- `office_insert_portal_job_access()`
- `office_update_portal_job_access()`
- `office_delete_portal_job_access()`
- `office_list_portal_job_access_for_sub()`

### Step 2: Emergency RLS Disable (if needed)
If you encounter RLS permission issues, run the emergency script:

```bash
psql -f scripts/portal-job-access-emergency-rls-off.sql
```

This will:
- Drop all RLS policies on `portal_job_access`
- Disable RLS completely
- Grant full access to anon and authenticated roles
- Reload the PostgREST schema cache

## Function Signatures

### Insert Portal Job Access
```sql
office_insert_portal_job_access(
  p_portal_user_id uuid,
  p_job_id uuid,
  p_can_view_schedule boolean DEFAULT true,
  p_can_view_documents boolean DEFAULT true,
  p_can_view_photos boolean DEFAULT false,
  p_can_view_financials boolean DEFAULT false,
  p_notes text DEFAULT NULL
) RETURNS jsonb
```

### Update Portal Job Access
```sql
office_update_portal_job_access(
  p_id uuid,
  p_can_view_schedule boolean DEFAULT NULL,
  p_can_view_documents boolean DEFAULT NULL,
  p_can_view_photos boolean DEFAULT NULL,
  p_can_view_financials boolean DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS jsonb
```

### Delete Portal Job Access
```sql
office_delete_portal_job_access(
  p_id uuid
) RETURNS jsonb
```

### List Portal Job Access for Subcontractor
```sql
office_list_portal_job_access_for_sub(
  p_portal_user_id uuid
) RETURNS jsonb
```

Returns an array of job access records with nested job data.

## Client Usage

### Direct RPC Calls (OnSpace Cloud)
```typescript
// Insert
const { data, error } = await supabase.rpc('office_insert_portal_job_access', {
  p_portal_user_id: 'uuid-here',
  p_job_id: 'uuid-here',
  p_can_view_schedule: true,
  p_can_view_documents: true,
  p_can_view_photos: false,
  p_can_view_financials: false,
  p_notes: 'Access notes'
});

// Update
const { data, error } = await supabase.rpc('office_update_portal_job_access', {
  p_id: 'uuid-here',
  p_can_view_photos: true
});

// Delete
const { data, error } = await supabase.rpc('office_delete_portal_job_access', {
  p_id: 'uuid-here'
});

// List all jobs for a subcontractor
const { data, error } = await supabase.rpc('office_list_portal_job_access_for_sub', {
  p_portal_user_id: 'uuid-here'
});
```

## Verification

After deployment, verify the functions are available:

```sql
-- Check function exists
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name LIKE 'office_%portal_job_access%';

-- Check permissions
SELECT routine_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name LIKE 'office_%portal_job_access%';

-- Test insert
SELECT office_insert_portal_job_access(
  'portal-user-uuid'::uuid,
  'job-uuid'::uuid,
  true, true, false, false,
  'Test access'
);

-- Test list
SELECT office_list_portal_job_access_for_sub('portal-user-uuid'::uuid);
```

## Deployment Checklist

- [ ] Run migration: `20260326000000_portal_job_access_onspace_rpcs.sql`
- [ ] Verify functions are created
- [ ] Test insert operation
- [ ] Test update operation
- [ ] Test delete operation
- [ ] Test list operation
- [ ] If RLS issues persist, run emergency script
- [ ] Verify PostgREST schema cache is reloaded
- [ ] Update application code to use new RPC functions
- [ ] Deploy application to production

## Notes

- These functions use `SECURITY DEFINER` to bypass RLS when needed
- `created_by` is set to NULL for PIN-based authentication (not Supabase Auth)
- All functions return JSONB for consistent response format
- The list function includes nested job data to reduce client-side queries
- PostgREST schema cache is automatically reloaded via NOTIFY

## Troubleshooting

### Issue: Permission Denied
**Solution**: Run the emergency RLS-off script

### Issue: Function Not Found
**Solution**: Verify PostgREST schema cache reloaded: `NOTIFY pgrst, 'reload schema';`

### Issue: Invalid UUID
**Solution**: Ensure UUIDs are properly formatted and exist in referenced tables
